/**
 * Global Effects Track Header — rendered at the top of the layer list.
 *
 * Provides "Global Effects" label with expand/collapse and "Add Effect" dropdown.
 */

import React from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useToolStore } from '../../../stores/toolStore';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft, Plus, Sparkles, Diamond } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { Button } from '../../ui/button';
import { getAllEffects, getEffect } from '../../../registry/effectRegistry';
import { EffectTrackRow } from './EffectTrackRow';
import { useEffectBlockHistory } from '../../../hooks/useEffectBlockHistory';

export const GlobalEffectsTrackHeader: React.FC = function GlobalEffectsTrackHeader() {
  const globalEffects = useTimelineStore((s) => s.globalEffects);
  const isExpanded = useTimelineStore((s) => s.view.globalEffectsExpanded);
  const toggleExpanded = useTimelineStore((s) => s.toggleGlobalEffectsExpanded);
  const addEffectBlock = useTimelineStore((s) => s.addEffectBlock);
  const { recordAdd } = useEffectBlockHistory();
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const expandedEffectTrackIds = useTimelineStore((s) => s.view.expandedEffectTrackIds);
  const moveEffectTrack = useTimelineStore((s) => s.moveEffectTrack);
  const addEffectKeyframe = useTimelineStore((s) => s.addEffectKeyframe);
  const removeEffectKeyframe = useTimelineStore((s) => s.removeEffectKeyframe);
  const selectKeyframes = useTimelineStore((s) => s.selectKeyframes);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const pushToHistory = useToolStore((s) => s.pushToHistory);
  const [isDragOverHeader, setIsDragOverHeader] = React.useState(false);

  const registeredEffects = getAllEffects();

  if (globalEffects.length === 0 && registeredEffects.length === 0) return null;

  return (
    <div>
      {/* Header row — also a drop target for dragging effects to global */}
      <div
        className={cn(
          'flex items-center px-2 min-h-[28px] bg-muted/30 cursor-pointer border-b border-border/50',
          'hover:bg-muted/50 transition-colors',
          isDragOverHeader && 'bg-primary/10 ring-1 ring-primary/40',
        )}
        onClick={() => toggleExpanded()}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/effect-block-id')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setIsDragOverHeader(true);
          }
        }}
        onDragLeave={() => setIsDragOverHeader(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOverHeader(false);
          const draggedBlockId = e.dataTransfer.getData('application/effect-block-id');
          if (!draggedBlockId) return;

          // Snapshot before move for undo
          const tl = useTimelineStore.getState();
          let sourceTrack: import('../../../types/effectBlock').EffectTrack | undefined;
          let sourceOwnerId: string | null = null;
          for (const l of tl.layers) {
            const t = (l.effectTracks ?? []).find((et) => (et.effectBlock.id as string) === draggedBlockId);
            if (t) { sourceTrack = t; sourceOwnerId = l.id as string; break; }
          }
          if (!sourceTrack) {
            for (const g of tl.layerGroups) {
              const t = (g.effectTracks ?? []).find((et) => (et.effectBlock.id as string) === draggedBlockId);
              if (t) { sourceTrack = t; sourceOwnerId = g.id as string; break; }
            }
          }
          if (!sourceTrack) {
            sourceTrack = tl.globalEffects.find((et) => (et.effectBlock.id as string) === draggedBlockId);
            if (sourceTrack) sourceOwnerId = null;
          }

          moveEffectTrack(
            draggedBlockId as import('../../../types/effectBlock').EffectBlockId,
            null,
          );

          // Record undo history
          if (sourceTrack) {
            useToolStore.getState().pushToHistory({
              type: 'effect_block_remove', timestamp: Date.now(), description: 'Move effect to global',
              data: {
                ownerId: sourceOwnerId,
                ownerType: sourceOwnerId === null ? 'global' : 'layer',
                trackSnapshot: structuredClone(sourceTrack),
                trackIndex: 0,
              },
            } as import('../../../types').EffectBlockRemoveHistoryAction);
          }

          if (!isExpanded) toggleExpanded();
        }}
      >
        <ChevronRight className={cn('w-3 h-3 mr-1 text-muted-foreground transition-transform', isExpanded && 'rotate-90')} />
        <Sparkles className="w-3 h-3 mr-1.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-foreground/80 flex-1">Global Effects</span>

        {/* Add effect button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 text-muted-foreground/60 hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {registeredEffects.map((effect) => (
              <DropdownMenuItem
                key={effect.type}
                onClick={() => {
                  const start = currentFrame;
                  const duration = Math.max(1, durationFrames - start);
                  const blockId = addEffectBlock(null, effect.type, start, duration);
                  if (blockId) {
                    recordAdd(null, blockId);
                    // Force-expand global effects section after state updates
                    setTimeout(() => {
                      const tl = useTimelineStore.getState();
                      if (!tl.view.globalEffectsExpanded) {
                        tl.toggleGlobalEffectsExpanded();
                      }
                      tl.selectEffectBlock(blockId);
                    }, 0);
                  }
                }}
              >
                <effect.icon className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                {effect.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Effect track rows (when expanded) */}
      {isExpanded && globalEffects.map((track, idx) => (
        <React.Fragment key={track.id}>
          <EffectTrackRow
            track={track}
            isExpanded={expandedEffectTrackIds.has(track.effectBlock.id)}
            index={idx}
          />
          {/* Effect property track labels when expanded */}
          {expandedEffectTrackIds.has(track.effectBlock.id) && track.effectBlock.propertyTracks.map((pt) => {
            const effectEntry = getEffect(track.effectBlock.effectType);
            const propDef = effectEntry?.propertyDefinitions.find((d) => d.path === pt.propertyPath);
            const currentFrame = useTimelineStore.getState().view.currentFrame;
            const existingKfAtFrame = pt.keyframes.find((kf) => kf.frame === currentFrame);
            return (
            <div
              key={pt.id}
              className="flex items-center px-3 min-h-[24px] border-b border-border/30 text-[10px] text-muted-foreground group/effprop"
            >
              <span className="flex-1 truncate">{propDef?.displayName ?? pt.propertyPath}</span>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-0.5 hover:bg-muted rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (existingKfAtFrame) {
                        pushToHistory({
                          type: 'effect_keyframe_remove', timestamp: Date.now(),
                          description: `Remove ${propDef?.displayName ?? pt.propertyPath} keyframe`,
                          data: { ownerId: null, ownerType: 'global', blockId: track.effectBlock.id as string,
                            trackId: pt.id as string, keyframe: structuredClone(existingKfAtFrame) },
                        } as import('../../../types').EffectKeyframeRemoveHistoryAction);
                        removeEffectKeyframe(track.effectBlock.id, pt.id, existingKfAtFrame.id as import('../../../types/timeline').KeyframeId);
                      } else {
                        const kfValue = (propDef?.defaultValue ?? 0) as import('../../../types/effectBlock').EffectKeyframe['value'];
                        const kfId = addEffectKeyframe(track.effectBlock.id, pt.id, currentFrame, kfValue);
                        pushToHistory({
                          type: 'effect_keyframe_add', timestamp: Date.now(),
                          description: `Add ${propDef?.displayName ?? pt.propertyPath} keyframe`,
                          data: { ownerId: null, ownerType: 'global', blockId: track.effectBlock.id as string,
                            trackId: pt.id as string,
                            keyframe: { id: kfId, frame: currentFrame, value: kfValue, easing: { type: 'linear' as const } } },
                        } as import('../../../types').EffectKeyframeAddHistoryAction);
                        if (kfId) {
                          selectKeyframes([kfId]);
                          setEditingKeyframe(kfId);
                        }
                      }
                    }}
                  >
                    {existingKfAtFrame ? (
                      <Diamond className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    ) : (
                      <Diamond className="w-3 h-3 text-muted-foreground/40 hover:text-yellow-400" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {existingKfAtFrame ? 'Remove keyframe at current frame' : 'Add keyframe at current frame'}
                </TooltipContent>
              </Tooltip>
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
      ))}
    </div>
  );
};
