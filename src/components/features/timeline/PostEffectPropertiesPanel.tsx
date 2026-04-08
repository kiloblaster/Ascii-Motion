/**
 * Post Effect Properties Panel — right-side panel showing all properties
 * for the selected post effect block, with value inputs and keyframe toggles.
 *
 * Shown when a post effect block is selected on the timeline.
 * Follows the same patterns as EffectPropertiesPanel but for WebGL shader effects.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { getPostEffect } from '../../../registry/postEffectRegistry';
import { evaluatePostEffectBlock } from '../../../utils/postEffectsPipeline';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { Trash2, Eye, EyeOff, Diamond } from 'lucide-react';
import { useScrubInput } from '../../../hooks/useScrubInput';
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

  // Check if this property has a keyframe at current frame
  const propTrack = block.propertyTracks.find((pt) => pt.propertyPath === definition.path);
  const existingKfAtFrame = propTrack?.keyframes.find((kf) => kf.frame === currentFrame);
  const hasKeyframes = propTrack && propTrack.keyframes.length > 0;

  // Update local value when external value changes
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(value ?? definition.defaultValue));
    }
  }, [value, definition.defaultValue, isFocused]);

  // Scrub input support for numeric fields
  const scrubRef = useScrubInput({
    value: typeof value === 'number' ? value : 0,
    min: definition.min ?? 0,
    max: definition.max ?? 100,
    step: definition.step ?? 1,
    onChange: (v: number) => onChange(v),
    disabled: definition.valueType !== 'number',
  });

  // Toggle keyframe at current frame
  const handleKeyframeToggle = useCallback(() => {
    if (existingKfAtFrame && propTrack) {
      removePostEffectKeyframe(
        block.id,
        propTrack.id as PostEffectPropertyTrackId,
        existingKfAtFrame.id as KeyframeId,
      );
    } else {
      // Ensure property track exists
      let trackId = propTrack?.id as PostEffectPropertyTrackId | null;
      if (!trackId) {
        trackId = addPostEffectPropertyTrack(block.id, definition.path);
      }
      if (trackId) {
        const currentVal = (value ?? definition.defaultValue) as number | boolean | string;
        addPostEffectKeyframe(block.id, trackId, currentFrame, currentVal);
        // Auto-expand the post effect track to reveal keyframes
        const tl = useTimelineStore.getState();
        if (!tl.view.expandedPostEffectTrackIds.has(block.id)) {
          togglePostEffectTrackExpanded(block.id);
        }
      }
    }
  }, [
    existingKfAtFrame, propTrack, block.id, definition.path,
    value, definition.defaultValue, currentFrame,
    addPostEffectPropertyTrack, addPostEffectKeyframe, removePostEffectKeyframe,
    togglePostEffectTrackExpanded,
  ]);

  // Check visibility condition
  if (definition.visibleWhen) {
    const condTrack = block.propertyTracks.find(
      (pt) => pt.propertyPath === definition.visibleWhen!.path,
    );
    const condValue = condTrack?.keyframes.length
      ? String(block.settings[definition.visibleWhen.path] ?? '')
      : String(block.settings[definition.visibleWhen.path] ?? '');
    if (!definition.visibleWhen.values.includes(condValue)) {
      return null;
    }
  }

  const renderInput = () => {
    switch (definition.valueType) {
      case 'number':
        return (
          <div className="flex items-center gap-1">
            <input
              ref={scrubRef as React.RefObject<HTMLInputElement>}
              type="number"
              value={localValue}
              min={definition.min}
              max={definition.max}
              step={definition.step}
              className="w-16 bg-muted/50 border border-border/50 rounded px-1.5 py-0.5 text-[11px] text-center tabular-nums"
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setIsFocused(false);
                const num = parseFloat(localValue);
                if (!isNaN(num)) {
                  const clamped = Math.min(
                    definition.max ?? Infinity,
                    Math.max(definition.min ?? -Infinity, num),
                  );
                  onChange(clamped);
                }
              }}
              onChange={(e) => setLocalValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            {definition.unit && (
              <span className="text-[9px] text-muted-foreground">{definition.unit}</span>
            )}
          </div>
        );

      case 'boolean':
        return (
          <button
            className={`w-8 h-5 rounded-full transition-colors ${
              value ? 'bg-purple-500' : 'bg-muted'
            }`}
            onClick={() => onChange(!value)}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                value ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        );

      case 'select':
        return (
          <Select
            value={String(value ?? definition.defaultValue)}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger className="h-6 text-[11px] w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {definition.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'color':
        return (
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={String(value ?? definition.defaultValue)}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-border/50"
            />
            <span className="text-[10px] text-muted-foreground font-mono">
              {String(value ?? definition.defaultValue)}
            </span>
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={localValue}
            className="w-20 bg-muted/50 border border-border/50 rounded px-1.5 py-0.5 text-[11px]"
            onChange={(e) => {
              setLocalValue(e.target.value);
              onChange(e.target.value);
            }}
          />
        );
    }
  };

  return (
    <div className="flex items-center justify-between py-1 px-2 hover:bg-muted/20 rounded group/proprow">
      <span className="text-[11px] text-foreground/70 flex-1 truncate mr-2">
        {definition.displayName}
      </span>

      {renderInput()}

      {/* Keyframe toggle */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="p-0.5 ml-1 hover:bg-muted rounded"
              onClick={handleKeyframeToggle}
            >
              {existingKfAtFrame ? (
                <Diamond className="w-3 h-3 text-purple-400 fill-purple-400" />
              ) : hasKeyframes ? (
                <Diamond className="w-3 h-3 text-purple-400/60" />
              ) : (
                <Diamond className="w-3 h-3 text-muted-foreground/30 hover:text-purple-400" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {existingKfAtFrame
              ? 'Remove keyframe at current frame'
              : 'Add keyframe at current frame'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
  const removePostEffectBlock = useTimelineStore((s) => s.removePostEffectBlock);
  const togglePostEffectBlockEnabled = useTimelineStore((s) => s.togglePostEffectBlockEnabled);
  const selectPostEffectBlock = useTimelineStore((s) => s.selectPostEffectBlock);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);

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

  // Group properties by category
  const categories = new Map<string, PostEffectPropertyDefinition[]>();
  for (const def of entry.propertyDefinitions) {
    const cat = def.category || 'General';
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(def);
  }

  return (
    <div className="space-y-1 p-2">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <entry.icon className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-medium flex-1">{entry.name}</span>

        {/* Enable/disable */}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => togglePostEffectBlockEnabled(block.id)}
        >
          {block.enabled ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5 text-muted-foreground/50" />
          )}
        </Button>

        {/* Delete */}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 hover:text-destructive"
          onClick={() => {
            removePostEffectBlock(block.id);
            selectPostEffectBlock(null);
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Property groups */}
      {Array.from(categories.entries()).map(([category, definitions]) => (
        <div key={category}>
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-2 mb-1 px-2">
            {category}
          </div>
          {definitions.map((def) => (
            <PostEffectPropertyRow
              key={def.path}
              definition={def}
              value={resolvedSettings[def.path]}
              onChange={(newValue) => {
                updatePostEffectBlockSettings(block.id, {
                  [def.path]: newValue,
                });
              }}
              block={block}
              currentFrame={currentFrame}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
