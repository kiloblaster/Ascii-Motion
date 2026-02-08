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
import { useKeyframeableProperty } from '../../../hooks/useKeyframeableProperty';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { Diamond, X } from 'lucide-react';
import type { PropertyPath, LayerId } from '../../../types/timeline';

/** All transform properties to show in the panel */
const TRANSFORM_PROPERTIES: PropertyPath[] = [
  'transform.position.x',
  'transform.position.y',
  'transform.scale',
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
    </div>
  );
};
