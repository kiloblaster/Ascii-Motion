/**
 * Post Effect Properties Panel — right-side panel showing all properties
 * for the selected post effect block, with value inputs and keyframe toggles.
 *
 * Shown when a post effect block is selected on the timeline.
 * Follows the same patterns as EffectPropertiesPanel but for WebGL shader effects.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useToolStore } from '../../../stores/toolStore';
import { getPostEffect } from '../../../registry/postEffectRegistry';
import { evaluatePostEffectBlock } from '../../../utils/postEffectsPipeline';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { Trash2, Eye, EyeOff, X, Diamond, RotateCcw } from 'lucide-react';
import { useScrubInput } from '../../../hooks/useScrubInput';
import { usePostEffectBlockHistory } from '../../../hooks/usePostEffectBlockHistory';
import type { PostEffectBlock, PostEffectPropertyTrackId } from '../../../types/postEffect';
import type { PostEffectPropertyDefinition } from '../../../types/postEffect';
import type { KeyframeId } from '../../../types/timeline';

// ============================================
// PROPERTY ROW COMPONENT
// ============================================

interface PostEffectPropertyRowProps {
  definition: PostEffectPropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  block: PostEffectBlock;
  currentFrame: number;
}

const PostEffectPropertyRow: React.FC<PostEffectPropertyRowProps> = ({
  definition,
  value,
  onChange,
  block,
  currentFrame,
}) => {
  const [localValue, setLocalValue] = useState<string>(String(value ?? definition.defaultValue));
  const [isFocused, setIsFocused] = useState(false);
  const addPostEffectPropertyTrack = useTimelineStore((s) => s.addPostEffectPropertyTrack);
  const addPostEffectKeyframe = useTimelineStore((s) => s.addPostEffectKeyframe);
  const removePostEffectKeyframe = useTimelineStore((s) => s.removePostEffectKeyframe);
  const togglePostEffectTrackExpanded = useTimelineStore((s) => s.togglePostEffectTrackExpanded);
  const pushToHistory = useToolStore((s) => s.pushToHistory);

  // Check if this property has a keyframe at current frame
  const propTrack = block.propertyTracks.find((pt) => pt.propertyPath === definition.path);
  const existingKfAtFrame = propTrack?.keyframes.find((kf) => kf.frame === currentFrame);
  const isTracked = !!propTrack;
  const hasKeyframeAtCurrentFrame = !!existingKfAtFrame;

  // Update local value when external value changes
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(value ?? definition.defaultValue));
    }
  }, [value, definition.defaultValue, isFocused]);

  // Auto-expand the post effect track to reveal keyframes
  const ensureExpanded = useCallback(() => {
    const tl = useTimelineStore.getState();
    if (!tl.view.expandedPostEffectTrackIds.has(block.id)) {
      togglePostEffectTrackExpanded(block.id);
    }
  }, [block.id, togglePostEffectTrackExpanded]);

  // Scrub input hook — attach onMouseDown to label for drag-to-scrub
  const scrubValue = typeof value === 'number' ? value : (definition.defaultValue as number);
  const scrub = useScrubInput({
    value: scrubValue,
    onChange: (v) => { setLocalValue(String(v)); onChange(v); },
    step: definition.step ?? 1,
    min: definition.min,
    max: definition.max,
  });

  // Toggle keyframe at current frame
  const handleKeyframeToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTracked) {
      // Create property track + add keyframe at current frame
      const trackId = addPostEffectPropertyTrack(block.id, definition.path);
      if (trackId) {
        const kfValue = (value ?? definition.defaultValue) as number | boolean | string;
        const kfId = addPostEffectKeyframe(block.id, trackId, currentFrame, kfValue);
        pushToHistory({
          type: 'effect_keyframe_add', timestamp: Date.now(), description: `Add ${definition.displayName} keyframe`,
          data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: trackId as string,
            keyframe: { id: kfId, frame: currentFrame, value: kfValue, easing: { type: 'linear' as const } } },
        } as import('../../../types').EffectKeyframeAddHistoryAction);
        ensureExpanded();
      }
    } else if (hasKeyframeAtCurrentFrame && existingKfAtFrame && propTrack) {
      // Remove keyframe at current frame — record before removing
      pushToHistory({
        type: 'effect_keyframe_remove', timestamp: Date.now(), description: `Remove ${definition.displayName} keyframe`,
        data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: propTrack.id as string,
          keyframe: structuredClone(existingKfAtFrame) },
      } as import('../../../types').EffectKeyframeRemoveHistoryAction);
      removePostEffectKeyframe(
        block.id,
        propTrack.id as PostEffectPropertyTrackId,
        existingKfAtFrame.id as KeyframeId,
      );
    } else if (propTrack) {
      // Add keyframe at current frame to existing track
      const kfValue = (value ?? definition.defaultValue) as number | boolean | string;
      const kfId = addPostEffectKeyframe(block.id, propTrack.id as PostEffectPropertyTrackId, currentFrame, kfValue);
      pushToHistory({
        type: 'effect_keyframe_add', timestamp: Date.now(), description: `Add ${definition.displayName} keyframe`,
        data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: propTrack.id as string,
          keyframe: { id: kfId, frame: currentFrame, value: kfValue, easing: { type: 'linear' as const } } },
      } as import('../../../types').EffectKeyframeAddHistoryAction);
      ensureExpanded();
    }
  }, [isTracked, hasKeyframeAtCurrentFrame, block.id, definition.path, definition.displayName, definition.defaultValue, currentFrame, value, existingKfAtFrame, propTrack, addPostEffectPropertyTrack, addPostEffectKeyframe, removePostEffectKeyframe, ensureExpanded, pushToHistory]);

  // Check visibility condition
  if (definition.visibleWhen) {
    const condValue = String(block.settings[definition.visibleWhen.path] ?? '');
    if (!definition.visibleWhen.values.includes(condValue)) {
      return null;
    }
  }

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

  // Color swatch
  if (definition.valueType === 'color') {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        {keyframeDiamond}
        <span className="text-[10px] text-muted-foreground w-20 truncate flex-shrink-0">
          {definition.displayName}
        </span>
        <input
          type="color"
          value={String(value ?? definition.defaultValue)}
          onChange={(e) => onChange(e.target.value)}
          className="w-5 h-5 rounded cursor-pointer border border-border/50 p-0"
        />
        <span className="text-[9px] text-muted-foreground/50 font-mono">
          {String(value ?? definition.defaultValue)}
        </span>
      </div>
    );
  }

  // Numeric input (default) — matches EffectPropertiesPanel layout
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      {keyframeDiamond}
      <span className="text-[10px] text-muted-foreground w-20 truncate flex-shrink-0 cursor-ew-resize" onMouseDown={scrub.onMouseDown}>
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

// ============================================
// MAIN PANEL COMPONENT
// ============================================

export const PostEffectPropertiesPanel: React.FC = function PostEffectPropertiesPanel() {
  const selectedPostEffectBlockId = useTimelineStore((s) => s.view.selectedPostEffectBlockId);
  const postEffectTracks = useTimelineStore((s) => s.postEffectTracks);
  const updatePostEffectBlockSettings = useTimelineStore((s) => s.updatePostEffectBlockSettings);
  const updatePostEffectKeyframe = useTimelineStore((s) => s.updatePostEffectKeyframe);
  const addPostEffectKeyframe = useTimelineStore((s) => s.addPostEffectKeyframe);
  const removePostEffectBlock = useTimelineStore((s) => s.removePostEffectBlock);
  const togglePostEffectBlockEnabled = useTimelineStore((s) => s.togglePostEffectBlockEnabled);
  const selectPostEffectBlock = useTimelineStore((s) => s.selectPostEffectBlock);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const pushToHistory = useToolStore((s) => s.pushToHistory);
  const { recordUpdate, recordRemove } = usePostEffectBlockHistory();

  // Find the selected post effect track
  const selectedTrack = useMemo(() => {
    if (!selectedPostEffectBlockId) return null;
    return postEffectTracks.find(
      (t) => t.effectBlock.id === selectedPostEffectBlockId,
    );
  }, [selectedPostEffectBlockId, postEffectTracks]);

  if (!selectedTrack) return null;

  const block = selectedTrack.effectBlock;
  const entry = getPostEffect(block.postEffectType);
  if (!entry) return null;

  // Evaluate current values (with keyframe interpolation)
  const resolvedSettings = evaluatePostEffectBlock(block, currentFrame);
  const Icon = entry.icon;

  // Group properties by category
  const categories = new Map<string, PostEffectPropertyDefinition[]>();
  for (const def of entry.propertyDefinitions) {
    const cat = def.category || 'General';
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(def);
  }

  return (
    <div className="w-56 flex-shrink-0 border-l border-border/50 bg-muted/10 flex flex-col">
      {/* Header — matches EffectPropertiesPanel layout */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50 bg-muted/20">
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-[11px] font-medium truncate flex-1">{entry.name}</span>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-0.5 hover:bg-muted rounded"
                onClick={() => {
                  const beforeBlock = structuredClone(block);
                  togglePostEffectBlockEnabled(block.id);
                  recordUpdate(block.id, beforeBlock);
                }}
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
          onClick={() => selectPostEffectBlock(null)}
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Properties by category */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {[...categories.entries()].map(([category, defs]) => {
          // Filter definitions by visibleWhen condition
          const visibleDefs = defs.filter((def) => {
            if (!def.visibleWhen) return true;
            const depValue = resolvedSettings[def.visibleWhen.path];
            return def.visibleWhen.values.includes(String(depValue));
          });
          if (visibleDefs.length === 0) return null;
          return (
          <div key={category} className="mb-2">
            <div className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-0.5">
              {category}
            </div>
            {visibleDefs.map((def) => {
              const propTrack = block.propertyTracks.find((pt) => pt.propertyPath === def.path);
              const kfAtFrame = propTrack?.keyframes.find((kf) => kf.frame === currentFrame);
              return (
              <PostEffectPropertyRow
                key={def.path}
                definition={def}
                value={resolvedSettings[def.path]}
                onChange={(newValue) => {
                  if (kfAtFrame && propTrack) {
                    // Update the existing keyframe value directly
                    const previousKf = structuredClone(kfAtFrame);
                    updatePostEffectKeyframe(
                      block.id,
                      propTrack.id as PostEffectPropertyTrackId,
                      kfAtFrame.id as KeyframeId,
                      { value: newValue as number | boolean | string },
                    );
                    pushToHistory({
                      type: 'effect_keyframe_update', timestamp: Date.now(), description: `Update ${def.displayName}`,
                      data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: propTrack.id as string,
                        keyframeId: kfAtFrame.id as string, previousKeyframe: previousKf,
                        newKeyframe: { ...previousKf, value: newValue } },
                    } as import('../../../types').EffectKeyframeUpdateHistoryAction);
                  } else if (propTrack) {
                    // Property is keyframed but no KF at playhead — auto-key: create one
                    const kfId = addPostEffectKeyframe(
                      block.id,
                      propTrack.id as PostEffectPropertyTrackId,
                      currentFrame,
                      newValue as number | boolean | string,
                    );
                    pushToHistory({
                      type: 'effect_keyframe_add', timestamp: Date.now(), description: `Auto-key ${def.displayName}`,
                      data: { ownerId: null, ownerType: 'layer', blockId: block.id as string, trackId: propTrack.id as string,
                        keyframe: { id: kfId, frame: currentFrame, value: newValue, easing: { type: 'linear' as const } } },
                    } as import('../../../types').EffectKeyframeAddHistoryAction);
                  } else {
                    // No property track at all (static property) — update block settings
                    const beforeBlock = structuredClone(block);
                    updatePostEffectBlockSettings(block.id, { [def.path]: newValue });
                    recordUpdate(block.id, beforeBlock);
                  }
                }}
                block={block}
                currentFrame={currentFrame}
              />
              );
            })}
          </div>
          );
        })}
      </div>

      {/* Footer actions — matches EffectPropertiesPanel pattern */}
      <div className="px-2 py-1.5 border-t border-border/50 space-y-1">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-6 text-[10px]"
          onClick={() => {
            const beforeBlock = structuredClone(block);
            const staticResets: Record<string, unknown> = {};

            for (const def of entry.propertyDefinitions) {
              const propTrack = block.propertyTracks.find((pt) => pt.propertyPath === def.path);
              if (propTrack) {
                // Keyframed property: add/update a keyframe at playhead with default value
                const existingKf = propTrack.keyframes.find((kf) => kf.frame === currentFrame);
                if (existingKf) {
                  updatePostEffectKeyframe(block.id, propTrack.id as PostEffectPropertyTrackId, existingKf.id as KeyframeId, { value: def.defaultValue as number | boolean | string });
                } else {
                  addPostEffectKeyframe(block.id, propTrack.id as PostEffectPropertyTrackId, currentFrame, def.defaultValue as number | boolean | string);
                }
              } else {
                staticResets[def.path] = def.defaultValue;
              }
            }

            if (Object.keys(staticResets).length > 0) {
              updatePostEffectBlockSettings(block.id, staticResets);
            }
            recordUpdate(block.id, beforeBlock);
          }}
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full h-6 text-[10px]"
          onClick={() => {
            recordRemove(block.id);
            removePostEffectBlock(block.id);
            selectPostEffectBlock(null);
          }}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
};
