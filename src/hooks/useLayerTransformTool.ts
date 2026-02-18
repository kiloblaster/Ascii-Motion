/**
 * useLayerTransformTool Hook
 *
 * Provides interactive on-canvas manipulation of layer transforms
 * (position, scale, rotation, anchor point) with a bounding box UI.
 *
 * Interaction zones:
 *  - Inside bounding box: drag to move (Shift constrains to axis)
 *  - Corner handles: drag to scale uniformly around anchor point
 *  - Outside bounding box: drag to rotate around anchor point
 *  - Anchor crosshair: drag to reposition anchor (Pan Behind)
 *
 * All property writes go through useKeyframeableProperty.setValue() for
 * auto-keyframe support on tracked properties and static fallback.
 *
 * Part of the Layer Timeline Refactor (Phase 4)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §4.10
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useCanvasContext } from '../contexts/CanvasContext';
import {
  getContentFrameAtTime,
  getTransformAtFrame,
  getGroupPropertyValue,
  applyRotation,
} from '../utils/layerCompositing';
import { PROPERTY_DEFINITIONS, type PropertyPath, type Layer } from '../types/timeline';
import { useKeyframeableProperty } from './useKeyframeableProperty';
import { useToolStore } from '../stores/toolStore';
import { toast } from 'sonner';

// ============================================
// Types
// ============================================

export type TransformDragMode = 'none' | 'move' | 'scale' | 'rotate' | 'anchor';

interface TransformDragState {
  mode: TransformDragMode;
  startMouseCell: { x: number; y: number };
  startValues: {
    positionX: number;
    positionY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    anchorPointX: number;
    anchorPointY: number;
  };
  shiftConstraintAxis: 'x' | 'y' | null;
  cornerIndex?: number;
}

export interface TransformBoundingBox {
  /** 4 corners in screen-space cell coordinates (forward-transformed from local bounds) */
  corners: { x: number; y: number }[];
  /** Local-space extent of content */
  localBounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Optional: the transform used to compute this bounding box */
  transform?: { positionX: number; positionY: number; scaleX: number; scaleY: number; rotation: number; anchorPointX: number; anchorPointY: number };
}

// ============================================
// Constants
// ============================================

const ANCHOR_HIT_RADIUS = 1.5; // cells
const HANDLE_HIT_RADIUS = 2.0; // cells — larger than the visual handle for easier clicking
const SCALE_MIN = PROPERTY_DEFINITIONS['transform.scale.x']?.min ?? 0.1;
const SCALE_MAX = PROPERTY_DEFINITIONS['transform.scale.x']?.max ?? 10;

// ============================================
// Geometry Helpers
// ============================================

/** Forward-transform a local-space point to screen-space using layer transforms */
function forwardTransformPoint(
  localX: number,
  localY: number,
  transform: { positionX: number; positionY: number; scaleX: number; scaleY: number; rotation: number; anchorPointX: number; anchorPointY: number },
  cellAspectRatio: number,
): { x: number; y: number } {
  // 1. Subtract anchor
  const relX = localX - transform.anchorPointX;
  const relY = localY - transform.anchorPointY;

  // 2. Apply scale
  const scaledX = relX * transform.scaleX;
  const scaledY = relY * transform.scaleY;

  // 3. Apply rotation (with cell aspect ratio compensation)
  const { rotatedX, rotatedY } = applyRotation(scaledX, scaledY, transform.rotation, cellAspectRatio);

  // 4. Add anchor + position
  return {
    x: rotatedX + transform.anchorPointX + transform.positionX,
    y: rotatedY + transform.anchorPointY + transform.positionY,
  };
}

/** Check if a point is inside a convex polygon (4-point quad) using cross product winding */
function isPointInQuad(
  px: number,
  py: number,
  corners: { x: number; y: number }[],
): boolean {
  if (corners.length < 3) return false;
  let positive = 0;
  let negative = 0;
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    const dx = corners[j].x - corners[i].x;
    const dy = corners[j].y - corners[i].y;
    const cpx = px - corners[i].x;
    const cpy = py - corners[i].y;
    const cross = dx * cpy - dy * cpx;
    if (cross > 0) positive++;
    else if (cross < 0) negative++;
    if (positive > 0 && negative > 0) return false;
  }
  return true;
}

/** Distance between two points */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Angle in degrees from point a to point b */
function angleDeg(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

// ============================================
// Hook
// ============================================

const EMPTY_LAYERS: Layer[] = [];

export function useLayerTransformTool() {
  const [dragState, setDragState] = useState<TransformDragState | null>(null);
  const [cursorZone, setCursorZone] = useState<TransformDragMode>('none');

  // Track whether we wrote values during this drag so we can write undo on mouseUp
  const didWriteRef = useRef(false);
  const startSnapshotRef = useRef<TransformDragState['startValues'] | null>(null);

  // Tool state — must be declared before selectors that use isTransformToolActive
  const activeTool = useToolStore((s) => s.activeTool);
  const isPlaybackMode = useToolStore((s) => s.isPlaybackMode);
  const isTransformToolActive = activeTool === 'layertransform';

  // Timeline state — only subscribe to layers when transform tool is active
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const activeGroupId = useTimelineStore((s) => s.view.activeGroupId);
  const layers = useTimelineStore((s) => isTransformToolActive ? s.layers : EMPTY_LAYERS);
  const layerGroups = useTimelineStore((s) => isTransformToolActive ? s.layerGroups : []);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const isPlaying = useTimelineStore((s) => s.view.isPlaying);

  // Canvas state
  const { cellWidth, cellHeight, shiftKeyDown } = useCanvasContext();

  // Determine the effective entity ID: layer or group (cast group ID as LayerId for the hook)
  const effectiveEntityId = activeLayerId ?? (activeGroupId as unknown as import('../types/timeline').LayerId) ?? null;
  const kfLayerId = isTransformToolActive ? effectiveEntityId : null;

  const activeLayer = useMemo(
    () => layers.find((l) => l.id === activeLayerId) ?? null,
    [layers, activeLayerId],
  );
  const activeGroup = useMemo(
    () => activeGroupId ? layerGroups.find((g) => g.id === activeGroupId) ?? null : null,
    [layerGroups, activeGroupId],
  );
  // Either a layer or a group is the active entity
  const hasActiveEntity = !!activeLayer || !!activeGroup;

  const cellAspectRatio = useMemo(
    () => (cellWidth && cellHeight ? cellWidth / cellHeight : 0.6),
    [cellWidth, cellHeight],
  );

  // Keyframeable property bindings — used for reading values and on mouseUp
  const posX = useKeyframeableProperty(kfLayerId, 'transform.position.x');
  const posY = useKeyframeableProperty(kfLayerId, 'transform.position.y');
  const scaleX = useKeyframeableProperty(kfLayerId, 'transform.scale.x');
  const scaleY = useKeyframeableProperty(kfLayerId, 'transform.scale.y');
  const rotation = useKeyframeableProperty(kfLayerId, 'transform.rotation');
  const anchorX = useKeyframeableProperty(kfLayerId, 'transform.anchorPoint.x');
  const anchorY = useKeyframeableProperty(kfLayerId, 'transform.anchorPoint.y');

  // Auto-keyframe mode
  const autoKeyframe = useToolStore((s) => s.layerTransformAutoKeyframe);

  const isDisabled = !hasActiveEntity || isPlaying || isPlaybackMode || !isTransformToolActive;
  const isLocked = (activeLayer?.locked ?? activeGroup?.locked) ?? false;

  /**
   * Write a property value directly to the store WITHOUT recording history.
   * Used during drag for live preview. History is recorded on mouseUp as a batch.
   */
  const setPropertyDirect = useCallback((propertyPath: PropertyPath, newValue: number) => {
    const entityId = effectiveEntityId;
    if (!entityId) return;
    const tl = useTimelineStore.getState();

    // Find the entity's property tracks (layer or group)
    const layer = tl.layers.find((l) => l.id === entityId);
    const group = !layer ? tl.layerGroups.find((g) => (g.id as unknown) === entityId) : null;
    const entity = layer ?? group;
    if (!entity) return;

    const track = entity.propertyTracks.find((t) => t.propertyPath === propertyPath);
    if (track) {
      const currentFrame = tl.view.currentFrame;
      const existingKf = track.keyframes.find((kf) => kf.frame === currentFrame);
      if (existingKf) {
        tl.updateKeyframe(entityId, track.id, existingKf.id, { value: newValue });
      } else {
        tl.addKeyframe(entityId, track.id, currentFrame, newValue);
      }
    } else {
      tl.setStaticProperty(entityId, propertyPath, newValue);
    }
  }, [effectiveEntityId]);

  // ============================================
  // Bounding Box Calculation
  // ============================================

  const boundingBox = useMemo((): TransformBoundingBox | null => {
    if (!hasActiveEntity) return null;

    // For groups, compute bounding box from all child layers
    if (activeGroup) {
      const childLayers = layers.filter(l => activeGroup.childLayerIds.includes(l.id));
      if (childLayers.length === 0) return null;

      // Get group transform
      const groupTransform = {
        positionX: getGroupPropertyValue(activeGroup, 'transform.position.x', currentFrame),
        positionY: getGroupPropertyValue(activeGroup, 'transform.position.y', currentFrame),
        scaleX: getGroupPropertyValue(activeGroup, 'transform.scale.x', currentFrame),
        scaleY: getGroupPropertyValue(activeGroup, 'transform.scale.y', currentFrame),
        rotation: getGroupPropertyValue(activeGroup, 'transform.rotation', currentFrame),
        anchorPointX: getGroupPropertyValue(activeGroup, 'transform.anchorPoint.x', currentFrame),
        anchorPointY: getGroupPropertyValue(activeGroup, 'transform.anchorPoint.y', currentFrame),
      };

      // Union of all child layer bounds (in screen space after their individual transforms)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const child of childLayers) {
        const cf = getContentFrameAtTime(child, currentFrame);
        if (!cf || cf.data.size === 0) continue;
        for (const key of cf.data.keys()) {
          const [x, y] = key.split(',').map(Number);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + 1);
          maxY = Math.max(maxY, y + 1);
        }
      }
      if (minX === Infinity) return null;

      // Forward-transform corners using group transform
      const corners = [
        forwardTransformPoint(minX, minY, groupTransform, cellAspectRatio),
        forwardTransformPoint(maxX, minY, groupTransform, cellAspectRatio),
        forwardTransformPoint(maxX, maxY, groupTransform, cellAspectRatio),
        forwardTransformPoint(minX, maxY, groupTransform, cellAspectRatio),
      ];

      return {
        corners,
        localBounds: { minX, minY, maxX, maxY },
        transform: groupTransform,
      };
    }

    if (!activeLayer) return null;

    const contentFrame = getContentFrameAtTime(activeLayer, currentFrame);
    if (!contentFrame || contentFrame.data.size === 0) return null;

    const transform = getTransformAtFrame(activeLayer, currentFrame);

    // If this layer belongs to a group, compose the group's transforms
    if (activeLayer.parentGroupId) {
      const parentGroup = layerGroups.find((g) => g.id === activeLayer.parentGroupId);
      if (parentGroup) {
        transform.positionX += getGroupPropertyValue(parentGroup, 'transform.position.x', currentFrame);
        transform.positionY += getGroupPropertyValue(parentGroup, 'transform.position.y', currentFrame);
        transform.scaleX *= getGroupPropertyValue(parentGroup, 'transform.scale.x', currentFrame);
        transform.scaleY *= getGroupPropertyValue(parentGroup, 'transform.scale.y', currentFrame);
        transform.rotation += getGroupPropertyValue(parentGroup, 'transform.rotation', currentFrame);
      }
    }

    // Find local-space extent
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const key of contentFrame.data.keys()) {
      const [x, y] = key.split(',').map(Number);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    // Include full cell extent
    maxX += 1;
    maxY += 1;

    // Forward-transform corners to screen space
    const corners = [
      forwardTransformPoint(minX, minY, transform, cellAspectRatio),
      forwardTransformPoint(maxX, minY, transform, cellAspectRatio),
      forwardTransformPoint(maxX, maxY, transform, cellAspectRatio),
      forwardTransformPoint(minX, maxY, transform, cellAspectRatio),
    ];

    return { corners, localBounds: { minX, minY, maxX, maxY } };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- .value deps intentionally included to trigger recomputation when transform values change
  }, [hasActiveEntity, activeLayer, activeGroup, layers, layerGroups, currentFrame, cellAspectRatio,
      posX.value, posY.value, scaleX.value, scaleY.value, rotation.value, anchorX.value, anchorY.value]);

  // Current anchor position in screen space (for overlay & hit testing)
  const anchorScreenPos = useMemo(() => {
    if (!hasActiveEntity) return { x: 0, y: 0 };
    let x = anchorX.value + posX.value;
    let y = anchorY.value + posY.value;
    // If this is a layer with a parent group, add group position offset
    if (activeLayer?.parentGroupId) {
      const parentGroup = layerGroups.find((g) => g.id === activeLayer.parentGroupId);
      if (parentGroup) {
        x += getGroupPropertyValue(parentGroup, 'transform.position.x', currentFrame);
        y += getGroupPropertyValue(parentGroup, 'transform.position.y', currentFrame);
      }
    }
    return { x, y };
  }, [hasActiveEntity, activeLayer, layerGroups, currentFrame, anchorX.value, anchorY.value, posX.value, posY.value]);

  // ============================================
  // Hit Testing
  // ============================================

  const hitTest = useCallback(
    (cellX: number, cellY: number): TransformDragMode => {
      // 1. Anchor point (highest priority)
      if (dist({ x: cellX, y: cellY }, anchorScreenPos) < ANCHOR_HIT_RADIUS) {
        return 'anchor';
      }

      // 2. Corner handles
      if (boundingBox) {
        for (let i = 0; i < boundingBox.corners.length; i++) {
          if (dist({ x: cellX, y: cellY }, boundingBox.corners[i]) < HANDLE_HIT_RADIUS) {
            return 'scale';
          }
        }

        // 3. Inside bounding box
        if (isPointInQuad(cellX, cellY, boundingBox.corners)) {
          return 'move';
        }
      }

      // 4. Outside bounding box
      return 'rotate';
    },
    [boundingBox, anchorScreenPos],
  );

  // Find which corner was hit (for scale)
  const findCornerIndex = useCallback(
    (cellX: number, cellY: number): number => {
      if (!boundingBox) return 0;
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < boundingBox.corners.length; i++) {
        const d = dist({ x: cellX, y: cellY }, boundingBox.corners[i]);
        if (d < closestDist) {
          closestDist = d;
          closest = i;
        }
      }
      return closest;
    },
    [boundingBox],
  );

  // ============================================
  // Mouse Handlers
  // ============================================

  const handleMouseDown = useCallback(
    (cellX: number, cellY: number) => {
      if (isDisabled) return;

      if (isLocked) {
        toast.info('Layer is locked');
        return;
      }

      const mode = hitTest(cellX, cellY);
      if (mode === 'none') return;

      // Capture start values for undo batching
      const startValues = {
        positionX: posX.value,
        positionY: posY.value,
        scaleX: scaleX.value,
        scaleY: scaleY.value,
        rotation: rotation.value,
        anchorPointX: anchorX.value,
        anchorPointY: anchorY.value,
      };

      startSnapshotRef.current = { ...startValues };
      didWriteRef.current = false;

      const state: TransformDragState = {
        mode,
        startMouseCell: { x: cellX, y: cellY },
        startValues,
        shiftConstraintAxis: null,
        cornerIndex: mode === 'scale' ? findCornerIndex(cellX, cellY) : undefined,
      };

      setDragState(state);

      // Auto-keyframe: create property tracks for affected properties if they don't exist
      if (autoKeyframe && effectiveEntityId) {
        const propsForMode: Record<TransformDragMode, PropertyPath[]> = {
          move: ['transform.position.x', 'transform.position.y'],
          scale: ['transform.scale.x', 'transform.scale.y'],
          rotate: ['transform.rotation'],
          anchor: ['transform.anchorPoint.x', 'transform.anchorPoint.y'],
          none: [],
        };
        const affectedProps = propsForMode[mode] ?? [];
        const tl = useTimelineStore.getState();
        const layer = tl.layers.find((l) => l.id === effectiveEntityId);
        const group = !layer ? tl.layerGroups.find((g) => (g.id as unknown) === effectiveEntityId) : null;
        const entity = layer ?? group;
        if (entity) {
          for (const prop of affectedProps) {
            const hasTrack = entity.propertyTracks.some((t) => t.propertyPath === prop);
            if (!hasTrack) {
              const trackId = tl.addPropertyTrack(effectiveEntityId, prop);
              if (trackId) {
                const currentValue = startValues[
                  prop === 'transform.position.x' ? 'positionX' :
                  prop === 'transform.position.y' ? 'positionY' :
                  prop === 'transform.scale.x' ? 'scaleX' :
                  prop === 'transform.scale.y' ? 'scaleY' :
                  prop === 'transform.rotation' ? 'rotation' :
                  prop === 'transform.anchorPoint.x' ? 'anchorPointX' :
                  'anchorPointY'
                ];
                tl.addKeyframe(effectiveEntityId, trackId, tl.view.currentFrame, currentValue);
              }
            }
          }
        }
      }
    },
    [isDisabled, isLocked, hitTest, findCornerIndex, posX.value, posY.value, scaleX.value, scaleY.value, rotation.value, anchorX.value, anchorY.value, autoKeyframe, effectiveEntityId],
  );

  const handleMouseMove = useCallback(
    (cellX: number, cellY: number) => {
      if (isDisabled) return;

      // Update cursor zone for visual feedback when not dragging
      if (!dragState) {
        if (!isLocked) {
          setCursorZone(hitTest(cellX, cellY));
        } else {
          setCursorZone('none');
        }
        return;
      }

      const { mode, startMouseCell, startValues } = dragState;
      didWriteRef.current = true;

      switch (mode) {
        case 'move': {
          let deltaX = cellX - startMouseCell.x;
          let deltaY = cellY - startMouseCell.y;

          // Shift constraint: lock to dominant axis
          if (shiftKeyDown) {
            let axis = dragState.shiftConstraintAxis;
            if (!axis) {
              // Determine dominant axis on first significant move
              if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                axis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
                setDragState((prev) =>
                  prev ? { ...prev, shiftConstraintAxis: axis } : null,
                );
              }
            }
            if (axis === 'x') deltaY = 0;
            if (axis === 'y') deltaX = 0;
          } else if (dragState.shiftConstraintAxis) {
            // Shift released — clear constraint
            setDragState((prev) =>
              prev ? { ...prev, shiftConstraintAxis: null } : null,
            );
          }

          setPropertyDirect('transform.position.x', Math.round(startValues.positionX + deltaX));
          setPropertyDirect('transform.position.y', Math.round(startValues.positionY + deltaY));
          break;
        }

        case 'scale': {
          const startDist = dist(
            { x: startMouseCell.x, y: startMouseCell.y },
            anchorScreenPos,
          );
          const currentDist = dist({ x: cellX, y: cellY }, anchorScreenPos);

          if (startDist > 0.01) {
            if (shiftKeyDown) {
              // Shift held: uniform scale
              const rawScale = startValues.scaleX * (currentDist / startDist);
              const clampedScale = Math.max(
                SCALE_MIN,
                Math.min(SCALE_MAX, Math.round(rawScale * 10) / 10),
              );
              setPropertyDirect('transform.scale.x', clampedScale);
              setPropertyDirect('transform.scale.y', clampedScale);
            } else {
              // Non-uniform: horizontal distance controls X, vertical controls Y
              const startDistX = Math.abs(startMouseCell.x - anchorScreenPos.x);
              const startDistY = Math.abs(startMouseCell.y - anchorScreenPos.y);
              const currentDistX = Math.abs(cellX - anchorScreenPos.x);
              const currentDistY = Math.abs(cellY - anchorScreenPos.y);

              if (startDistX > 0.01) {
                const rawSX = startValues.scaleX * (currentDistX / startDistX);
                setPropertyDirect('transform.scale.x', Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(rawSX * 10) / 10)));
              }
              if (startDistY > 0.01) {
                const rawSY = startValues.scaleY * (currentDistY / startDistY);
                setPropertyDirect('transform.scale.y', Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(rawSY * 10) / 10)));
              }
            }
          }
          break;
        }

        case 'rotate': {
          const startAngle = angleDeg(anchorScreenPos, {
            x: startMouseCell.x,
            y: startMouseCell.y,
          });
          const currentAngle = angleDeg(anchorScreenPos, { x: cellX, y: cellY });
          const deltaAngle = currentAngle - startAngle;
          const newRotation = Math.round(startValues.rotation + deltaAngle);
          setPropertyDirect('transform.rotation', newRotation);
          break;
        }

        case 'anchor': {
          // Move anchor only — don't compensate position.
          // In our compositing formula (screen = rotate(scale(x - anchor)) + anchor + pos),
          // moving anchor alone keeps content stationary at identity transform,
          // and the crosshair tracks the mouse 1:1 since anchorScreen = anchor + pos.
          const deltaX = cellX - startMouseCell.x;
          const deltaY = cellY - startMouseCell.y;
          const newAnchorX = Math.round(startValues.anchorPointX + deltaX);
          const newAnchorY = Math.round(startValues.anchorPointY + deltaY);
          setPropertyDirect('transform.anchorPoint.x', newAnchorX);
          setPropertyDirect('transform.anchorPoint.y', newAnchorY);
          break;
        }
      }
    },
    [
      isDisabled,
      isLocked,
      dragState,
      hitTest,
      shiftKeyDown,
      anchorScreenPos,
      setPropertyDirect,
    ],
  );

  const handleMouseUp = useCallback(() => {
    if (!dragState || !activeLayerId) {
      setDragState(null);
      return;
    }

    const startVals = startSnapshotRef.current;
    if (didWriteRef.current && startVals) {
      // Record batched history entries for each property that actually changed.
      // We use the history-wrapped setters which will push to the undo stack,
      // but first revert to the start values via direct store write, then
      // re-apply via the history path so the action captures old→new correctly.
      const propertyMap: Array<{ path: PropertyPath; startVal: number; currentGetter: { value: number; setValue: (v: number) => void } }> = [
        { path: 'transform.position.x', startVal: startVals.positionX, currentGetter: posX },
        { path: 'transform.position.y', startVal: startVals.positionY, currentGetter: posY },
        { path: 'transform.scale.x', startVal: startVals.scaleX, currentGetter: scaleX },
        { path: 'transform.scale.y', startVal: startVals.scaleY, currentGetter: scaleY },
        { path: 'transform.rotation', startVal: startVals.rotation, currentGetter: rotation },
        { path: 'transform.anchorPoint.x', startVal: startVals.anchorPointX, currentGetter: anchorX },
        { path: 'transform.anchorPoint.y', startVal: startVals.anchorPointY, currentGetter: anchorY },
      ];

      for (const { path, startVal, currentGetter } of propertyMap) {
        const finalVal = currentGetter.value;
        if (finalVal !== startVal) {
          // Temporarily revert to start value (direct, no history)
          setPropertyDirect(path, startVal);
          // Re-apply final value through history-recording path
          // This captures old=startVal → new=finalVal in the undo stack
          currentGetter.setValue(finalVal);
        }
      }
    }

    setDragState(null);
    didWriteRef.current = false;
    startSnapshotRef.current = null;
  }, [dragState, activeLayerId, posX, posY, scaleX, scaleY, rotation, anchorX, anchorY, setPropertyDirect]);

  // ============================================
  // Cursor Zone  
  // ============================================

  /** Get the CSS cursor class for the current zone */
  const getCursorForZone = useCallback(
    (zone: TransformDragMode): string => {
      if (isLocked) return 'cursor-not-allowed';
      switch (zone) {
        case 'move':
          return 'cursor-move';
        case 'scale':
          return 'cursor-nwse-resize';
        case 'rotate':
          return 'cursor-crosshair';
        case 'anchor':
          return 'cursor-crosshair';
        default:
          return 'cursor-default';
      }
    },
    [isLocked],
  );

  return {
    boundingBox,
    dragState,
    cursorZone,
    anchorScreenPos,
    isDisabled,
    isLocked,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    getCursorForZone,
    activeLayer,
    activeGroup,
    hasActiveEntity,
  };
}

// ============================================
// Shared handler ref for mouse event routing
// ============================================
// PERF FIX: useCanvasMouseHandlers previously called useLayerTransformTool()
// unconditionally, adding ~49 React hooks to every CanvasGrid render even
// when the transform tool wasn't active. Now useCanvasMouseHandlers reads
// from this ref instead, and only LayerTransformOverlay (which is conditionally
// mounted) writes to it.

export interface LayerTransformMouseHandlers {
  handleMouseDown: (cellX: number, cellY: number) => void;
  handleMouseMove: (cellX: number, cellY: number) => void;
  handleMouseUp: () => void;
}

const NOOP_HANDLERS: LayerTransformMouseHandlers = {
  handleMouseDown: () => {},
  handleMouseMove: () => {},
  handleMouseUp: () => {},
};

/** Shared ref — written by LayerTransformOverlay, read by useCanvasMouseHandlers */
export const layerTransformHandlersRef = { current: NOOP_HANDLERS };
