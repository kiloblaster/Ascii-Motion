/**
 * Layer Compositing Utilities
 * 
 * Composites all visible layers at a given frame into a single Map<string, Cell>
 * for rendering. Handles visibility, solo mode, opacity, and transform properties
 * (position, scale, rotation) with keyframe interpolation.
 * 
 * Rendering order: First layer in array = bottom (rendered first)
 * Cell priority: Top layer's non-empty cell overwrites lower layers
 * 
 * Part of the Layer Timeline Refactor (Phase 2)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §2.4
 */

import type { Cell } from '../types';
import type {
  Layer,
  LayerGroup,
  ContentFrame,
  PropertyPath,
} from '../types/timeline';
import type { EffectTrack } from '../types/effectBlock';
import { PROPERTY_DEFINITIONS } from '../types/timeline';
import { interpolateKeyframes } from '../types/easing';
import { CELL_ASPECT_RATIO } from '../utils/fontMetrics';
import { applyEffectsToLayer, hasActiveEffectsAtFrame } from './effectsPipeline';

// ============================================
// MAIN COMPOSITING FUNCTION
// ============================================

/**
 * Composite all visible layers at a given frame.
 * Returns a Map of cells for rendering.
 * 
 * @param layers - Array of layers ordered by z-index (first = bottom)
 * @param frame - Current frame number
 * @param canvasWidth - Canvas width in cells
 * @param canvasHeight - Canvas height in cells
 * @param cellAspectRatio - Cell width/height ratio for rotation compensation
 * @returns Composited cell map ready for rendering
 */
export function compositeLayersAtFrame(
  layers: Layer[],
  frame: number,
  canvasWidth: number,
  canvasHeight: number,
  cellAspectRatio: number = CELL_ASPECT_RATIO,
  clip: boolean = true,
  groups?: LayerGroup[],
  globalEffectTracks?: EffectTrack[],
): Map<string, Cell> {
  const result = new Map<string, Cell>();

  // Check if any layer is solo'd
  const hasSoloLayer = layers.some((l) => l.solo);

  // Iterate layers from bottom to top (first in array = bottom)
  for (const layer of layers) {
    // Skip invisible layers
    if (!layer.visible) continue;

    // If any layer is solo'd, only render solo'd layers
    if (hasSoloLayer && !layer.solo) continue;

    // Get content frame at this time
    const contentFrame = getContentFrameAtTime(layer, frame);
    if (!contentFrame) continue;

    // Apply per-layer procedural effects (non-destructive, in local space)
    let cellData = contentFrame.data;
    if (layer.effectTracks?.length > 0 && hasActiveEffectsAtFrame(layer.effectTracks, frame)) {
      cellData = applyEffectsToLayer(cellData, layer.effectTracks, frame, {
        canvasBackgroundColor: '#000000',
        frame,
      });
    }

    // Get transform values at this frame via keyframe interpolation
    let posX = getPropertyValueAtFrame(layer, 'transform.position.x', frame);
    let posY = getPropertyValueAtFrame(layer, 'transform.position.y', frame);
    let scaleX = getPropertyValueAtFrame(layer, 'transform.scale.x', frame);
    let scaleY = getPropertyValueAtFrame(layer, 'transform.scale.y', frame);
    let rotation = getPropertyValueAtFrame(layer, 'transform.rotation', frame);
    const anchorX = getPropertyValueAtFrame(layer, 'transform.anchorPoint.x', frame);
    const anchorY = getPropertyValueAtFrame(layer, 'transform.anchorPoint.y', frame);

    // Compose group transforms if this layer belongs to a group
    if (layer.parentGroupId && groups) {
      const group = groups.find((g) => g.id === layer.parentGroupId);
      if (group) {
        const gPosX = getGroupPropertyValue(group, 'transform.position.x', frame);
        const gPosY = getGroupPropertyValue(group, 'transform.position.y', frame);
        const gScaleX = getGroupPropertyValue(group, 'transform.scale.x', frame);
        const gScaleY = getGroupPropertyValue(group, 'transform.scale.y', frame);
        const gRotation = getGroupPropertyValue(group, 'transform.rotation', frame);
        const gAnchorX = getGroupPropertyValue(group, 'transform.anchorPoint.x', frame);
        const gAnchorY = getGroupPropertyValue(group, 'transform.anchorPoint.y', frame);
        // Compose: group transform applied after layer transform
        // Apply group anchor offset, then group scale/rotation, then group position
        posX += gPosX;
        posY += gPosY;
        scaleX *= gScaleX;
        scaleY *= gScaleY;
        rotation += gRotation;
        // Group anchor offsets the composited result
        if (gAnchorX !== 0 || gAnchorY !== 0) {
          // Anchor shifts the rotation/scale center for the group
          // The offset is already handled by the compositing math via position + anchor
        }
      }
    }

    // Check if transforms are identity (common case — skip expensive math)
    const hasTransform =
      posX !== 0 ||
      posY !== 0 ||
      scaleX !== 1 ||
      scaleY !== 1 ||
      rotation !== 0 ||
      anchorX !== 0 ||
      anchorY !== 0;

    // Apply each cell from the content frame
    if (hasTransform) {
      // ── Inverse mapping: iterate destination cells, sample source ──
      // This prevents gaps that forward mapping creates during scale/rotation.
      // 
      // 1. Compute the screen-space bounding box by forward-transforming the
      //    content's local bounding box corners.
      // 2. For each cell in that screen-space box, inverse-transform to find
      //    which source cell it maps to.
      // 3. If the source cell exists, place it at the destination.

      // Find local-space content bounds
      let localMinX = Infinity, localMaxX = -Infinity;
      let localMinY = Infinity, localMaxY = -Infinity;
      for (const coordKey of cellData.keys()) {
        const commaIdx = coordKey.indexOf(',');
        const x = parseInt(coordKey.substring(0, commaIdx), 10);
        const y = parseInt(coordKey.substring(commaIdx + 1), 10);
        if (x < localMinX) localMinX = x;
        if (x > localMaxX) localMaxX = x;
        if (y < localMinY) localMinY = y;
        if (y > localMaxY) localMaxY = y;
      }

      if (localMinX === Infinity) continue; // empty content frame

      // Forward-transform the 4 corners of the local bounding box to screen space
      const corners = [
        forwardTransform(localMinX, localMinY),
        forwardTransform(localMaxX + 1, localMinY),
        forwardTransform(localMinX, localMaxY + 1),
        forwardTransform(localMaxX + 1, localMaxY + 1),
      ];

      // Find the axis-aligned bounding box in screen space
      let screenMinX = Infinity, screenMaxX = -Infinity;
      let screenMinY = Infinity, screenMaxY = -Infinity;
      for (const c of corners) {
        if (c.x < screenMinX) screenMinX = c.x;
        if (c.x > screenMaxX) screenMaxX = c.x;
        if (c.y < screenMinY) screenMinY = c.y;
        if (c.y > screenMaxY) screenMaxY = c.y;
      }

      // Add 1-cell padding to avoid edge clipping from rounding
      screenMinX -= 1;
      screenMinY -= 1;
      screenMaxX += 1;
      screenMaxY += 1;

      // Build the transform object for inverseTransformPoint
      const transform = { positionX: posX, positionY: posY, scaleX, scaleY, rotation, anchorPointX: anchorX, anchorPointY: anchorY };

      // Iterate every destination cell in the screen-space bounding box
      for (let sy = screenMinY; sy <= screenMaxY; sy++) {
        for (let sx = screenMinX; sx <= screenMaxX; sx++) {
          // Bounds check (only when clipping for export)
          if (clip && (sx < 0 || sx >= canvasWidth || sy < 0 || sy >= canvasHeight)) {
            continue;
          }

          // Inverse-transform to find the source cell
          const source = inverseTransformPoint(sx, sy, transform);
          const sourceKey = `${source.x},${source.y}`;
          const cell = cellData.get(sourceKey);

          if (cell && cell.char && cell.char !== ' ') {
            result.set(`${sx},${sy}`, cell);
          }
        }
      }

      // Helper: forward-transform a local-space point to screen space
      function forwardTransform(x: number, y: number): { x: number; y: number } {
        const localX = x - anchorX;
        const localY = y - anchorY;
        const scaledX = localX * scaleX;
        const scaledY = localY * scaleY;
        const { rotatedX, rotatedY } = applyRotation(scaledX, scaledY, rotation, cellAspectRatio);
        return {
          x: Math.round(rotatedX + anchorX + posX),
          y: Math.round(rotatedY + anchorY + posY),
        };
      }
    } else {
      // No transform — use coordinates directly (fast path, forward mapping is fine)
      for (const [coordKey, cell] of cellData) {
        if (!cell.char || cell.char === ' ') continue;

        const commaIdx = coordKey.indexOf(',');
        const finalX = parseInt(coordKey.substring(0, commaIdx), 10);
        const finalY = parseInt(coordKey.substring(commaIdx + 1), 10);

        if (clip && (finalX < 0 || finalX >= canvasWidth || finalY < 0 || finalY >= canvasHeight)) {
          continue;
        }

        result.set(coordKey, cell);
      }
    }
  }

  // Apply global effects post-compositing (screen space)
  if (globalEffectTracks && globalEffectTracks.length > 0 && hasActiveEffectsAtFrame(globalEffectTracks, frame)) {
    const globalResult = applyEffectsToLayer(result, globalEffectTracks, frame, {
      canvasBackgroundColor: '#000000',
      frame,
    });
    return globalResult;
  }

  return result;
}

// ============================================
// CONTENT FRAME LOOKUP
// ============================================

/**
 * Get the content frame active at a given frame number for a layer.
 * Returns null if the frame falls in a gap between content frames.
 * 
 * PERF FIX: Uses binary search (O(log F)) instead of linear scan (O(F)).
 * Content frames are sorted by startFrame, so binary search is valid.
 * Falls back to linear scan if the array appears unsorted.
 */
export function getContentFrameAtTime(layer: Layer, frame: number): ContentFrame | null {
  const cfs = layer.contentFrames;
  if (cfs.length === 0) return null;

  // Binary search: content frames are sorted by startFrame
  let lo = 0;
  let hi = cfs.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cf = cfs[mid];

    if (frame < cf.startFrame) {
      hi = mid - 1;
    } else if (frame >= cf.startFrame + cf.durationFrames) {
      lo = mid + 1;
    } else {
      // frame is within this content frame's range
      if (cf.hidden) return null;
      return cf;
    }
  }

  return null;
}

// ============================================
// PROPERTY VALUE INTERPOLATION
// ============================================

/**
 * Get the interpolated value of a property at a specific frame for a layer.
 * Uses the keyframe interpolation system from easing.ts.
 * 
 * If the property has no track or no keyframes, returns the default value
 * from PROPERTY_DEFINITIONS.
 * 
 * @param layer - The layer to query
 * @param propertyPath - The property path (e.g., 'transform.position.x')
 * @param frame - The frame number to evaluate at
 * @returns The interpolated numeric value
 */
export function getPropertyValueAtFrame(
  layer: Layer,
  propertyPath: PropertyPath,
  frame: number,
): number {
  // Find the property track for this path
  const track = layer.propertyTracks.find((t) => t.propertyPath === propertyPath);

  if (!track || track.keyframes.length === 0) {
    // Check layer-specific static value first, then global default
    if (layer.staticProperties && propertyPath in layer.staticProperties) {
      return layer.staticProperties[propertyPath];
    }
    const def = PROPERTY_DEFINITIONS[propertyPath];
    return (def?.defaultValue as number) ?? 0;
  }

  // Use the keyframe interpolation system
  return interpolateKeyframes(track.keyframes, frame, track.loopKeyframes);
}

/**
 * Get all property values for a layer at a specific frame.
 * Convenience function that returns all transform properties at once.
 */
export function getTransformAtFrame(
  layer: Layer,
  frame: number,
): {
  positionX: number;
  positionY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorPointX: number;
  anchorPointY: number;
} {
  return {
    positionX: getPropertyValueAtFrame(layer, 'transform.position.x', frame),
    positionY: getPropertyValueAtFrame(layer, 'transform.position.y', frame),
    scaleX: getPropertyValueAtFrame(layer, 'transform.scale.x', frame),
    scaleY: getPropertyValueAtFrame(layer, 'transform.scale.y', frame),
    rotation: getPropertyValueAtFrame(layer, 'transform.rotation', frame),
    anchorPointX: getPropertyValueAtFrame(layer, 'transform.anchorPoint.x', frame),
    anchorPointY: getPropertyValueAtFrame(layer, 'transform.anchorPoint.y', frame),
  };
}

// ============================================
// TRANSFORM HELPERS
// ============================================

/**
 * Apply rotation at 1° increments around the origin.
 * Accounts for cell aspect ratio (cells are typically taller than wide).
 * 
 * Cells rotated off-canvas are preserved in layer data — they simply
 * won't render. This prevents data loss when animating rotation.
 * 
 * @param x - X position after anchor/scale
 * @param y - Y position after anchor/scale
 * @param degrees - Rotation angle in degrees
 * @param cellAspectRatio - Cell width/height ratio (typically 0.6 for monospace)
 * @returns Rotated coordinates snapped to whole cells
 */
export function applyRotation(
  x: number,
  y: number,
  degrees: number,
  cellAspectRatio: number = CELL_ASPECT_RATIO,
): { rotatedX: number; rotatedY: number } {
  if (degrees === 0) return { rotatedX: x, rotatedY: y };

  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // Scale x to account for cell aspect ratio, making rotation visually correct
  const scaledX = x * cellAspectRatio;

  // Apply rotation
  const rotatedScaledX = scaledX * cos - y * sin;
  const rotatedY = scaledX * sin + y * cos;

  // Scale x back and snap to whole cells
  const rotatedX = Math.round(rotatedScaledX / cellAspectRatio);

  return { rotatedX, rotatedY: Math.round(rotatedY) };
}

// ============================================
// LAYER VISIBILITY HELPERS
// ============================================

/**
 * Get the list of layers that would be visible at render time.
 * Respects visibility and solo mode.
 */
export function getVisibleLayers(layers: Layer[]): Layer[] {
  const hasSoloLayer = layers.some((l) => l.solo);

  return layers.filter((layer) => {
    if (!layer.visible) return false;
    if (hasSoloLayer && !layer.solo) return false;
    return true;
  });
}

/**
 * Check if a layer is editable (visible and not locked).
 */
export function isLayerEditable(layer: Layer): boolean {
  return layer.visible && !layer.locked;
}

/**
 * Inverse-transform a screen-space cell coordinate back to layer-local space.
 * This is the reverse of the forward transform applied during compositing.
 *
 * Used by drawing tools so that drawing on the composited canvas writes
 * to the correct position in the layer's raw data.
 *
 * @param screenX - Cell X in composited (screen) space
 * @param screenY - Cell Y in composited (screen) space
 * @param transform - The layer's transform at the current frame
 * @returns Layer-local cell coordinates
 */
export function inverseTransformPoint(
  screenX: number,
  screenY: number,
  transform: ReturnType<typeof getTransformAtFrame>,
): { x: number; y: number } {
  const { positionX, positionY, scaleX, scaleY, rotation, anchorPointX, anchorPointY } = transform;

  // 1. Remove position and anchor offset
  const relX = screenX - positionX - anchorPointX;
  const relY = screenY - positionY - anchorPointY;

  // 2. Inverse rotation (negate angle)
  const { rotatedX: invRotX, rotatedY: invRotY } = applyRotation(
    relX, relY, -rotation,
  );

  // 3. Inverse scale (per-axis)
  const localX = scaleX !== 0 ? Math.round(invRotX / scaleX + anchorPointX) : anchorPointX;
  const localY = scaleY !== 0 ? Math.round(invRotY / scaleY + anchorPointY) : anchorPointY;

  return { x: localX, y: localY };
}

// ============================================
// GROUP PROPERTY HELPERS
// ============================================

/**
 * Get a property value from a LayerGroup at a given frame.
 * Mirrors getPropertyValueAtFrame but works with LayerGroup's propertyTracks.
 */
export function getGroupPropertyValue(
  group: LayerGroup,
  propertyPath: PropertyPath,
  frame: number,
): number {
  const track = group.propertyTracks.find((t) => t.propertyPath === propertyPath);

  if (!track || track.keyframes.length === 0) {
    // Check group static properties first, then defaults
    if (group.staticProperties && propertyPath in group.staticProperties) {
      return group.staticProperties[propertyPath];
    }
    const def = PROPERTY_DEFINITIONS[propertyPath];
    return (def?.defaultValue as number) ?? 0;
  }

  return interpolateKeyframes(track.keyframes, frame, track.loopKeyframes);
}
