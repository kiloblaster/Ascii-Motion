/**
 * Layer Properties Panel — right-side panel showing all transform property
 * values for the active layer at the current playhead, with keyframe toggles.
 *
 * Shows when a layer is active and no keyframe is being edited.
 * Uses useKeyframeableProperty for each transform property.
 *
 * Part of the Layer Timeline Refactor (Phase 4)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §4.6a
 */

import React, { useState, useCallback } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useCanvasStore } from '../../../stores/canvasStore';
import { useKeyframeableProperty } from '../../../hooks/useKeyframeableProperty';
import { useTimelineHistory } from '../../../hooks/useTimelineHistory';
import { useToolStore } from '../../../stores/toolStore';
import { PROPERTY_DEFINITIONS } from '../../../types/timeline';
import { getTransformAtFrame, applyRotation, inverseTransformPoint } from '../../../utils/layerCompositing';
import { CELL_ASPECT_RATIO } from '../../../utils/fontMetrics';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Diamond, X, RotateCcw, CheckCheck } from 'lucide-react';
import type { PropertyPath, LayerId, ContentFrameId } from '../../../types/timeline';
import type { Cell } from '../../../types';

/** All transform properties to show in the panel */
const TRANSFORM_PROPERTIES: PropertyPath[] = [
  'transform.position.x',
  'transform.position.y',
  'transform.scale.x',
  'transform.scale.y',
  'transform.rotation',
  'transform.anchorPoint.x',
  'transform.anchorPoint.y',
];

interface PropertyRowProps {
  layerId: LayerId;
  propertyPath: PropertyPath;
}

const PropertyRow: React.FC<PropertyRowProps> = ({ layerId, propertyPath }) => {
  const {
    value,
    setValue,
    toggleTrack,
    toggleKeyframe,
    isTracked,
    hasKeyframeAtCurrentFrame,
    definition,
  } = useKeyframeableProperty(layerId, propertyPath);

  const [localValue, setLocalValue] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState(false);

  // Sync local value when the store value changes (and input is not focused)
  const displayValue = isFocused ? localValue : String(value);

  const commitValue = useCallback(() => {
    const num = parseFloat(localValue);
    if (!isNaN(num) && num !== value) {
      setValue(num);
    }
    // Reset local to actual value
    setLocalValue(String(isNaN(num) ? value : num));
  }, [localValue, value, setValue]);

  const handleFocus = () => {
    setIsFocused(true);
    setLocalValue(String(value));
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitValue();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = definition?.step ?? 1;
      const delta = e.key === 'ArrowUp' ? step : -step;
      const current = parseFloat(localValue) || 0;
      let next = current + delta;
      if (definition?.min !== undefined) next = Math.max(definition.min, next);
      if (definition?.max !== undefined) next = Math.min(definition.max, next);
      setLocalValue(String(next));
      setValue(next);
    }
  };

  const handleKeyframeToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTracked) {
      toggleKeyframe();
    } else {
      toggleTrack();
    }
  };

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex-shrink-0 p-0.5 hover:bg-muted rounded"
              onClick={handleKeyframeToggle}
            >
              <Diamond
                className={`w-3 h-3 ${
                  hasKeyframeAtCurrentFrame
                    ? 'text-yellow-400 fill-yellow-400'
                    : isTracked
                      ? 'text-yellow-500'
                      : 'text-muted-foreground/40'
                }`}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {hasKeyframeAtCurrentFrame
              ? 'Remove keyframe at playhead'
              : isTracked
                ? 'Add keyframe at playhead'
                : 'Add property track + keyframe'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <span className="text-[10px] text-muted-foreground w-14 truncate flex-shrink-0">
        {definition?.displayName ?? propertyPath.split('.').pop()}
      </span>

      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="h-5 text-[10px] px-1 flex-1 min-w-0 rounded border border-border/50 bg-background text-foreground outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />

      {definition?.unit && (
        <span className="text-[9px] text-muted-foreground/50 w-5 flex-shrink-0">
          {definition.unit}
        </span>
      )}
    </div>
  );
};

export const LayerPropertiesPanel: React.FC = () => {
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const layers = useTimelineStore((s) => s.layers);
  const setShowLayerProperties = useTimelineStore((s) => s.setShowLayerProperties);
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const {
    addKeyframe: addKeyframeHistory,
    updateKeyframe: updateKeyframeHistory,
    setStaticProperty: setStaticPropertyHistory,
  } = useTimelineHistory();

  if (!activeLayer) {
    return null;
  }

  return (
    <div className="w-48 flex-shrink-0 border-l border-border/50 bg-muted/20 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50">
        <div className="min-w-0">
          <span className="text-xs font-medium truncate block">{activeLayer.name}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 flex-shrink-0"
          onClick={() => setShowLayerProperties(false)}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>

      {/* Property rows */}
      <div className="px-2 py-1">
        {TRANSFORM_PROPERTIES.map((path) => (
          <PropertyRow
            key={path}
            layerId={activeLayerId!}
            propertyPath={path}
          />
        ))}
      </div>

      {/* Reset transforms */}
      <div className="px-2 pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (!activeLayerId) return;
            const tl = useTimelineStore.getState();
            const layer = tl.layers.find((l) => l.id === activeLayerId);
            if (!layer) return;

            const { width, height } = useCanvasStore.getState();
            const currentFrame = tl.view.currentFrame;

            // Default values (anchor = canvas center, others = identity)
            const defaults: Record<string, number> = {
              'transform.position.x': 0,
              'transform.position.y': 0,
              'transform.scale.x': 1,
              'transform.scale.y': 1,
              'transform.rotation': 0,
              'transform.anchorPoint.x': Math.floor(width / 2),
              'transform.anchorPoint.y': Math.floor(height / 2),
            };

            for (const path of TRANSFORM_PROPERTIES) {
              const track = layer.propertyTracks.find((t) => t.propertyPath === path);
              const defaultVal = defaults[path] ?? (PROPERTY_DEFINITIONS[path]?.defaultValue as number) ?? 0;

              if (track && track.keyframes.length > 0) {
                // Has keyframes — add a keyframe at playhead with default value (with history)
                const existingKf = track.keyframes.find((kf) => kf.frame === currentFrame);
                if (existingKf) {
                  updateKeyframeHistory(activeLayerId, track.id, existingKf.id, { value: defaultVal });
                } else {
                  addKeyframeHistory(activeLayerId, track.id, currentFrame, defaultVal);
                }
              } else {
                // Static property — set to default (with history)
                setStaticPropertyHistory(activeLayerId, path, defaultVal);
              }
            }
          }}
        >
          <RotateCcw className="w-3 h-3" />
          Reset Transforms
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => setShowApplyDialog(true)}
        >
          <CheckCheck className="w-3 h-3" />
          Apply Transforms
        </Button>
      </div>

      {/* Apply Transforms confirmation dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Apply Transforms</DialogTitle>
            <DialogDescription>
              Applying transforms will bake the current position, scale, and rotation into the layer's content data and reset all transform values to their defaults.
              This will <strong>clear all keyframes</strong> on this layer's transform properties.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              if (!activeLayerId || !activeLayer) return;

              const tl = useTimelineStore.getState();
              const { width, height } = useCanvasStore.getState();
              const pushToHistory = useToolStore.getState().pushToHistory;

              // Snapshot the full layer before any changes (for undo)
              const previousLayer = structuredClone(activeLayer);

              // For each content frame, bake the transform at that frame into the cell data
              for (const cf of activeLayer.contentFrames) {
                const transform = getTransformAtFrame(activeLayer, cf.startFrame);
                const { positionX, positionY, scaleX, scaleY, rotation, anchorPointX, anchorPointY } = transform;

                const hasTransform =
                  positionX !== 0 || positionY !== 0 ||
                  scaleX !== 1 || scaleY !== 1 ||
                  rotation !== 0 || anchorPointX !== 0 || anchorPointY !== 0;

                if (!hasTransform) continue;

                // Use inverse mapping (same as compositing) to avoid gaps
                // 1. Find local-space content bounds
                let localMinX = Infinity, localMaxX = -Infinity;
                let localMinY = Infinity, localMaxY = -Infinity;
                for (const key of cf.data.keys()) {
                  const [cx, cy] = key.split(',').map(Number);
                  if (cx < localMinX) localMinX = cx;
                  if (cx > localMaxX) localMaxX = cx;
                  if (cy < localMinY) localMinY = cy;
                  if (cy > localMaxY) localMaxY = cy;
                }
                if (localMinX === Infinity) continue;

                // 2. Forward-transform corners to find screen-space AABB
                const fwd = (lx: number, ly: number) => {
                  const sx = (lx - anchorPointX) * scaleX;
                  const sy = (ly - anchorPointY) * scaleY;
                  const { rotatedX, rotatedY } = applyRotation(sx, sy, rotation, CELL_ASPECT_RATIO);
                  return {
                    x: Math.round(rotatedX + anchorPointX + positionX),
                    y: Math.round(rotatedY + anchorPointY + positionY),
                  };
                };
                const corners = [
                  fwd(localMinX, localMinY), fwd(localMaxX + 1, localMinY),
                  fwd(localMinX, localMaxY + 1), fwd(localMaxX + 1, localMaxY + 1),
                ];
                let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
                for (const c of corners) {
                  if (c.x < sMinX) sMinX = c.x;
                  if (c.x > sMaxX) sMaxX = c.x;
                  if (c.y < sMinY) sMinY = c.y;
                  if (c.y > sMaxY) sMaxY = c.y;
                }
                sMinX -= 1; sMinY -= 1; sMaxX += 1; sMaxY += 1;

                // 3. Iterate destination cells, inverse-transform to find source
                const transformObj = { positionX, positionY, scaleX, scaleY, rotation, anchorPointX, anchorPointY };
                const newData = new Map<string, Cell>();
                for (let dy = sMinY; dy <= sMaxY; dy++) {
                  for (let dx = sMinX; dx <= sMaxX; dx++) {
                    const src = inverseTransformPoint(dx, dy, transformObj);
                    const srcKey = `${src.x},${src.y}`;
                    const cell = cf.data.get(srcKey);
                    if (cell && cell.char && cell.char !== ' ') {
                      newData.set(`${dx},${dy}`, cell);
                    }
                  }
                }

                tl.updateContentFrameData(activeLayerId, cf.id, newData);
              }

              // Remove all property tracks (and their keyframes)
              for (const track of [...activeLayer.propertyTracks]) {
                tl.removePropertyTrack(activeLayerId, track.id);
              }

              // Reset static properties to defaults
              const defaults: Record<string, number> = {
                'transform.position.x': 0,
                'transform.position.y': 0,
                'transform.scale.x': 1,
                'transform.scale.y': 1,
                'transform.rotation': 0,
                'transform.anchorPoint.x': Math.floor(width / 2),
                'transform.anchorPoint.y': Math.floor(height / 2),
              };
              for (const [path, val] of Object.entries(defaults)) {
                tl.setStaticProperty(activeLayerId, path, val);
              }

              // Reload canvas from the updated content frame
              const currentFrame = tl.view.currentFrame;
              const updatedLayer = useTimelineStore.getState().layers.find((l) => l.id === activeLayerId);
              if (updatedLayer) {
                const cf = updatedLayer.contentFrames.find(
                  (c) => currentFrame >= c.startFrame && currentFrame < c.startFrame + c.durationFrames,
                );
                if (cf) {
                  useCanvasStore.getState().setCanvasData(new Map(cf.data));
                }
              }

              // Record undo with full layer snapshots (includes tracks, keyframes, static props)
              const newLayer = structuredClone(useTimelineStore.getState().layers.find((l) => l.id === activeLayerId)!);
              pushToHistory({
                type: 'apply_transforms',
                timestamp: Date.now(),
                description: 'Apply transforms',
                data: {
                  layerId: activeLayerId as string,
                  previousLayer,
                  newLayer,
                },
              });

              setShowApplyDialog(false);
            }}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
