/**
 * Effect Properties Panel — right-side panel showing all properties
 * for the selected effect block, with value inputs and keyframe toggles.
 *
 * Shown when an effect block is selected on the timeline.
 * Replaces the LayerPropertiesPanel in the right sidebar.
 */

import React, { useState, useCallback } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { getEffect } from '../../../registry/effectRegistry';
import { evaluateEffectBlock } from '../../../utils/effectsPipeline';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { Trash2, Eye, EyeOff, X, Diamond } from 'lucide-react';
import type { EffectTrack, EffectPropertyDefinition, EffectBlock } from '../../../types/effectBlock';
import type { KeyframeId } from '../../../types/timeline';

/**
 * Find the effect track containing a block by its ID across layers, groups, and global.
 */
function findTrackByBlockId(blockId: string): { track: EffectTrack; ownerId: string | null } | null {
  const state = useTimelineStore.getState();

  // Search layers
  for (const layer of state.layers) {
    for (const track of (layer.effectTracks ?? [])) {
      if ((track.effectBlock.id as string) === blockId) {
        return { track, ownerId: layer.id as string };
      }
    }
  }

  // Search groups
  for (const group of state.layerGroups) {
    for (const track of (group.effectTracks ?? [])) {
      if ((track.effectBlock.id as string) === blockId) {
        return { track, ownerId: group.id as string };
      }
    }
  }

  // Search global
  for (const track of state.globalEffects) {
    if ((track.effectBlock.id as string) === blockId) {
      return { track, ownerId: null };
    }
  }

  return null;
}

interface EffectPropertyRowProps {
  definition: EffectPropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  block: EffectBlock;
  currentFrame: number;
}

const EffectPropertyRow: React.FC<EffectPropertyRowProps> = ({ definition, value, onChange, block, currentFrame }) => {
  const [localValue, setLocalValue] = useState<string>(String(value ?? definition.defaultValue));
  const [isFocused, setIsFocused] = useState(false);
  const addEffectPropertyTrack = useTimelineStore((s) => s.addEffectPropertyTrack);
  const addEffectKeyframe = useTimelineStore((s) => s.addEffectKeyframe);
  const removeEffectKeyframe = useTimelineStore((s) => s.removeEffectKeyframe);

  // Find existing property track and keyframe at current frame
  const existingTrack = block.propertyTracks.find((pt) => pt.propertyPath === definition.path);
  const existingKf = existingTrack?.keyframes.find((kf) => kf.frame === currentFrame);
  const isTracked = !!existingTrack;
  const hasKeyframeAtCurrentFrame = !!existingKf;

  const handleKeyframeToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTracked) {
      // Create property track + add keyframe at current frame
      const trackId = addEffectPropertyTrack(block.id, definition.path);
      if (trackId) {
        const kfValue = (value ?? definition.defaultValue) as import('../../../types/effectBlock').EffectKeyframe['value'];
        addEffectKeyframe(block.id, trackId, currentFrame, kfValue);
      }
    } else if (hasKeyframeAtCurrentFrame && existingKf && existingTrack) {
      // Remove keyframe at current frame
      removeEffectKeyframe(block.id, existingTrack.id, existingKf.id as KeyframeId);
    } else if (existingTrack) {
      // Add keyframe at current frame
      const kfValue = (value ?? definition.defaultValue) as import('../../../types/effectBlock').EffectKeyframe['value'];
      addEffectKeyframe(block.id, existingTrack.id, currentFrame, kfValue);
    }
  }, [isTracked, hasKeyframeAtCurrentFrame, block.id, definition.path, definition.defaultValue, currentFrame, value, existingKf, existingTrack, addEffectPropertyTrack, addEffectKeyframe, removeEffectKeyframe]);

  const keyframeDiamond = (
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
  );

  const displayValue = isFocused ? localValue : String(value ?? definition.defaultValue);

  const commitValue = useCallback(() => {
    if (definition.valueType === 'number') {
      const num = parseFloat(localValue);
      if (!isNaN(num)) {
        let clamped = num;
        if (definition.min !== undefined) clamped = Math.max(definition.min, clamped);
        if (definition.max !== undefined) clamped = Math.min(definition.max, clamped);
        onChange(clamped);
        setLocalValue(String(clamped));
        return;
      }
    } else if (definition.valueType === 'boolean') {
      onChange(!value);
      return;
    }
    setLocalValue(String(value ?? definition.defaultValue));
  }, [localValue, value, definition, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitValue();
      (e.target as HTMLInputElement).blur();
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && definition.valueType === 'number') {
      e.preventDefault();
      const step = definition.step ?? 1;
      const delta = e.key === 'ArrowUp' ? step : -step;
      const current = parseFloat(localValue) || 0;
      let next = current + delta;
      if (definition.min !== undefined) next = Math.max(definition.min, next);
      if (definition.max !== undefined) next = Math.min(definition.max, next);
      setLocalValue(String(next));
      onChange(next);
    }
  };

  // Boolean toggle
  if (definition.valueType === 'boolean') {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        {keyframeDiamond}
        <span className="text-[10px] text-muted-foreground w-20 truncate flex-shrink-0">
          {definition.displayName}
        </span>
        <button
          className="h-5 px-2 text-[10px] rounded border border-border/50 bg-background hover:bg-muted"
          onClick={() => onChange(!value)}
        >
          {value ? 'On' : 'Off'}
        </button>
      </div>
    );
  }

  // Select dropdown
  if (definition.valueType === 'select' && definition.options) {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        {keyframeDiamond}
        <span className="text-[10px] text-muted-foreground w-20 truncate flex-shrink-0">
          {definition.displayName}
        </span>
        <select
          className="h-5 text-[10px] px-1 flex-1 min-w-0 rounded border border-border/50 bg-background text-foreground outline-none"
          value={String(value ?? definition.defaultValue)}
          onChange={(e) => onChange(e.target.value)}
        >
          {definition.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  // Mapping type — show as read-only count
  if (definition.valueType === 'mapping') {
    const mappingValue = value as Record<string, string> | undefined;
    const count = mappingValue ? Object.keys(mappingValue).length : 0;
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        {keyframeDiamond}
        <span className="text-[10px] text-muted-foreground w-20 truncate flex-shrink-0">
          {definition.displayName}
        </span>
        <span className="text-[10px] text-foreground/60">
          {count} mapping{count !== 1 ? 's' : ''}
        </span>
      </div>
    );
  }

  // Numeric input (default)
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      {keyframeDiamond}
      <span className="text-[10px] text-muted-foreground w-20 truncate flex-shrink-0">
        {definition.displayName}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => { setIsFocused(true); setLocalValue(String(value ?? definition.defaultValue)); }}
        onBlur={() => { setIsFocused(false); commitValue(); }}
        onKeyDown={handleKeyDown}
        className="h-5 text-[10px] px-1 flex-1 min-w-0 rounded border border-border/50 bg-background text-foreground outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {definition.unit && (
        <span className="text-[9px] text-muted-foreground/50 w-5 flex-shrink-0">
          {definition.unit}
        </span>
      )}
    </div>
  );
};

export const EffectPropertiesPanel: React.FC = () => {
  const selectedEffectBlockId = useTimelineStore((s) => s.view.selectedEffectBlockId);
  const selectEffectBlock = useTimelineStore((s) => s.selectEffectBlock);
  const updateEffectBlockSettings = useTimelineStore((s) => s.updateEffectBlockSettings);
  const updateEffectKeyframe = useTimelineStore((s) => s.updateEffectKeyframe);
  const toggleEffectBlockEnabled = useTimelineStore((s) => s.toggleEffectBlockEnabled);
  const removeEffectBlock = useTimelineStore((s) => s.removeEffectBlock);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);

  // Re-read layers/groups/globalEffects to react to changes
  useTimelineStore((s) => s.layers);
  useTimelineStore((s) => s.layerGroups);
  useTimelineStore((s) => s.globalEffects);

  if (!selectedEffectBlockId) return null;

  const found = findTrackByBlockId(selectedEffectBlockId as string);
  if (!found) return null;

  const { track, ownerId } = found;
  const block = track.effectBlock;
  const entry = getEffect(block.effectType);
  if (!entry) return null;

  // Evaluate current settings at this frame (resolves keyframed values)
  const resolvedSettings = evaluateEffectBlock(block, currentFrame);
  const Icon = entry.icon;

  // Group properties by category
  const categories = new Map<string, EffectPropertyDefinition[]>();
  for (const def of entry.propertyDefinitions) {
    const cat = def.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(def);
  }

  return (
    <div className="w-56 flex-shrink-0 border-l border-border/50 bg-muted/10 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50 bg-muted/20">
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-[11px] font-medium truncate flex-1">{entry.name}</span>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-0.5 hover:bg-muted rounded"
                onClick={() => toggleEffectBlockEnabled(block.id)}
              >
                {block.enabled
                  ? <Eye className="w-3 h-3 text-muted-foreground" />
                  : <EyeOff className="w-3 h-3 text-muted-foreground/50" />
                }
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{block.enabled ? 'Disable' : 'Enable'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <button
          className="p-0.5 hover:bg-muted rounded"
          onClick={() => selectEffectBlock(null)}
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Time range display */}
      <div className="px-2 py-1 text-[9px] text-muted-foreground/60 border-b border-border/30">
        Frames {block.startFrame}–{block.startFrame + block.durationFrames}
      </div>

      {/* Properties by category */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {[...categories.entries()].map(([category, defs]) => (
          <div key={category} className="mb-2">
            <div className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-0.5">
              {category}
            </div>
            {defs.map((def) => {
              // Check if a keyframe track + keyframe exists at current frame
              const propTrack = block.propertyTracks.find((pt) => pt.propertyPath === def.path);
              const kfAtFrame = propTrack?.keyframes.find((kf) => kf.frame === currentFrame);
              return (
              <EffectPropertyRow
                key={def.path}
                definition={def}
                value={resolvedSettings[def.path]}
                onChange={(newValue) => {
                  if (kfAtFrame && propTrack) {
                    // Update the keyframe value directly
                    updateEffectKeyframe(
                      block.id,
                      propTrack.id,
                      kfAtFrame.id as import('../../../types/timeline').KeyframeId,
                      { value: newValue as import('../../../types/effectBlock').EffectKeyframe['value'] },
                    );
                  } else {
                    // No keyframe at current frame — update block settings
                    updateEffectBlockSettings(block.id, { [def.path]: newValue });
                  }
                }}
                block={block}
                currentFrame={currentFrame}
              />
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="px-2 py-1.5 border-t border-border/50 flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-6 text-[10px]"
          onClick={() => {
            removeEffectBlock(
              ownerId as import('../../../types/timeline').LayerId | import('../../../types/timeline').LayerGroupId | null,
              block.id,
            );
            selectEffectBlock(null);
          }}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
};
