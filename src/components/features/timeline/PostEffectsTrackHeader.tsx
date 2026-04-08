/**
 * Post Effects Track Header — rendered at the very top of the timeline layer list.
 *
 * Provides "Post Effects" label with expand/collapse and "Add Post Effect" dropdown.
 * Post effects are always global (no per-layer ownership) and their array order
 * determines the render order (first = applied first).
 */

import React from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft, Plus, Layers, Diamond, Eye, EyeOff, Trash2, GripVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { Button } from '../../ui/button';
import { getAllPostEffects, getPostEffect } from '../../../registry/postEffectRegistry';
import { evaluatePostEffectBlock } from '../../../utils/postEffectsPipeline';
import { usePostEffectBlockHistory } from '../../../hooks/usePostEffectBlockHistory';
import type { PostEffectBlockId, PostEffectPropertyTrackId } from '../../../types/postEffect';
import type { KeyframeId } from '../../../types/timeline';

// Category colors for post effects — distinct purple/magenta palette
const POST_EFFECT_CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  distortion: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400' },
  blur: { bg: 'bg-fuchsia-500/20', border: 'border-fuchsia-500/50', text: 'text-fuchsia-400' },
  glow: { bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'text-pink-400' },
  color: { bg: 'bg-violet-500/20', border: 'border-violet-500/50', text: 'text-violet-400' },
};

const DEFAULT_COLORS = { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400' };

export const PostEffectsTrackHeader: React.FC = function PostEffectsTrackHeader() {
  const postEffectTracks = useTimelineStore((s) => s.postEffectTracks);
  const isExpanded = useTimelineStore((s) => s.view.postEffectsExpanded);
  const toggleExpanded = useTimelineStore((s) => s.togglePostEffectsExpanded);
  const addPostEffectBlock = useTimelineStore((s) => s.addPostEffectBlock);
  const removePostEffectBlock = useTimelineStore((s) => s.removePostEffectBlock);
  const togglePostEffectBlockEnabled = useTimelineStore((s) => s.togglePostEffectBlockEnabled);
  const selectPostEffectBlock = useTimelineStore((s) => s.selectPostEffectBlock);
  const selectedPostEffectBlockId = useTimelineStore((s) => s.view.selectedPostEffectBlockId);
  const expandedPostEffectTrackIds = useTimelineStore((s) => s.view.expandedPostEffectTrackIds);
  const togglePostEffectTrackExpanded = useTimelineStore((s) => s.togglePostEffectTrackExpanded);
  const addPostEffectKeyframe = useTimelineStore((s) => s.addPostEffectKeyframe);
  const removePostEffectKeyframe = useTimelineStore((s) => s.removePostEffectKeyframe);
  const addPostEffectPropertyTrack = useTimelineStore((s) => s.addPostEffectPropertyTrack);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);

  const { recordAdd, recordRemove, recordUpdate } = usePostEffectBlockHistory();

  const registeredPostEffects = getAllPostEffects();

  if (postEffectTracks.length === 0 && registeredPostEffects.length === 0) return null;

  return (
    <div>
      {/* Header row */}
      <div
        className={cn(
          'flex items-center px-2 min-h-[28px] bg-purple-500/5 cursor-pointer border-b border-border/50',
          'hover:bg-purple-500/10 transition-colors',
        )}
        onClick={() => toggleExpanded()}
      >
        <ChevronRight className={cn('w-3 h-3 mr-1 text-purple-400/60 transition-transform', isExpanded && 'rotate-90')} />
        <Layers className="w-3 h-3 mr-1.5 text-purple-400/60" />
        <span className="text-[11px] font-medium text-purple-300/80 flex-1">Post Effects</span>

        {/* Add post effect button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 text-purple-400/60 hover:text-purple-300"
              onClick={(e) => e.stopPropagation()}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            {registeredPostEffects.map((effect) => (
              <DropdownMenuItem
                key={effect.type}
                onClick={() => {
                  // Post effects default to full timeline
                  const blockId = addPostEffectBlock(effect.type, 0, durationFrames);
                  if (blockId) {
                    recordAdd(blockId);
                    setTimeout(() => {
                      const tl = useTimelineStore.getState();
                      if (!tl.view.postEffectsExpanded) {
                        tl.togglePostEffectsExpanded();
                      }
                      tl.selectPostEffectBlock(blockId);
                    }, 0);
                  }
                }}
              >
                <effect.icon className="w-3.5 h-3.5 mr-2 text-purple-400" />
                {effect.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Post effect track rows (when expanded) */}
      {isExpanded && postEffectTracks.map((track) => {
        const block = track.effectBlock;
        const entry = getPostEffect(block.postEffectType);
        const colors = POST_EFFECT_CATEGORY_COLORS[entry?.category ?? 'distortion'] ?? DEFAULT_COLORS;
        const isSelected = selectedPostEffectBlockId === block.id;
        const isTrackExpanded = expandedPostEffectTrackIds.has(block.id);

        return (
          <React.Fragment key={track.id}>
            {/* Effect track row */}
            <div
              className={cn(
                'flex items-center px-3 min-h-[24px] border-b border-border/30 cursor-pointer group/petrow',
                isSelected ? 'bg-purple-500/15' : 'hover:bg-muted/30',
              )}
              onClick={() => selectPostEffectBlock(block.id)}
            >
              {/* Drag handle */}
              <GripVertical className="w-3 h-3 mr-1 text-muted-foreground/30 opacity-0 group-hover/petrow:opacity-100 cursor-grab" />

              {/* Expand/collapse property tracks */}
              <button
                className="p-0.5 mr-1"
                onClick={(e) => {
                  e.stopPropagation();
                  // Auto-create property tracks if not yet created
                  if (!isTrackExpanded && entry) {
                    for (const propDef of entry.propertyDefinitions) {
                      addPostEffectPropertyTrack(block.id, propDef.path);
                    }
                  }
                  togglePostEffectTrackExpanded(block.id);
                }}
              >
                <ChevronRight className={cn('w-3 h-3 text-muted-foreground/50 transition-transform', isTrackExpanded && 'rotate-90')} />
              </button>

              {/* Effect icon & name */}
              {entry && <entry.icon className={cn('w-3 h-3 mr-1.5', colors.text)} />}
              <span className="text-[11px] text-foreground/70 flex-1 truncate">
                {entry?.name ?? block.postEffectType}
              </span>

              {/* Enable/disable toggle */}
              <button
                className="p-0.5 opacity-0 group-hover/petrow:opacity-100 hover:bg-muted rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  const beforeBlock = structuredClone(block);
                  togglePostEffectBlockEnabled(block.id);
                  recordUpdate(block.id, beforeBlock);
                }}
              >
                {block.enabled ? (
                  <Eye className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <EyeOff className="w-3 h-3 text-muted-foreground/40" />
                )}
              </button>

              {/* Delete button */}
              <button
                className="p-0.5 opacity-0 group-hover/petrow:opacity-100 hover:bg-destructive/20 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  recordRemove(block.id);
                  removePostEffectBlock(block.id);
                }}
              >
                <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>

            {/* Property track sub-rows (when expanded) */}
            {isTrackExpanded && block.propertyTracks.map((pt) => {
              const propDef = entry?.propertyDefinitions.find((d) => d.path === pt.propertyPath);
              const existingKfAtFrame = pt.keyframes.find((kf) => kf.frame === currentFrame);

              return (
                <div
                  key={pt.id}
                  className="flex items-center px-3 min-h-[24px] border-b border-border/30 text-[10px] text-muted-foreground group/peffprop"
                >
                  <span className="flex-1 truncate pl-4">{propDef?.displayName ?? pt.propertyPath}</span>

                  {/* Previous keyframe */}
                  <button
                    className="p-0.5 hover:bg-muted rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      const prev = [...pt.keyframes].map((kf) => kf.frame).filter((f) => f < currentFrame).sort((a, b) => b - a)[0];
                      if (prev !== undefined) useTimelineStore.getState().goToFrame(prev);
                    }}
                    disabled={!pt.keyframes.some((kf) => kf.frame < currentFrame)}
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>

                  {/* Keyframe diamond toggle */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="p-0.5 hover:bg-muted rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (existingKfAtFrame) {
                              removePostEffectKeyframe(block.id, pt.id as PostEffectPropertyTrackId, existingKfAtFrame.id as KeyframeId);
                            } else {
                              const resolved = evaluatePostEffectBlock(block, currentFrame);
                              const kfValue = (resolved[pt.propertyPath] ?? propDef?.defaultValue ?? 0) as number | boolean | string;
                              addPostEffectKeyframe(block.id, pt.id as PostEffectPropertyTrackId, currentFrame, kfValue);
                            }
                          }}
                        >
                          {existingKfAtFrame ? (
                            <Diamond className="w-3 h-3 text-purple-400 fill-purple-400" />
                          ) : (
                            <Diamond className="w-3 h-3 text-muted-foreground/40 hover:text-purple-400" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {existingKfAtFrame ? 'Remove keyframe at current frame' : 'Add keyframe at current frame'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Next keyframe */}
                  <button
                    className="p-0.5 hover:bg-muted rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = [...pt.keyframes].map((kf) => kf.frame).filter((f) => f > currentFrame).sort((a, b) => a - b)[0];
                      if (next !== undefined) useTimelineStore.getState().goToFrame(next);
                    }}
                    disabled={!pt.keyframes.some((kf) => kf.frame > currentFrame)}
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};
