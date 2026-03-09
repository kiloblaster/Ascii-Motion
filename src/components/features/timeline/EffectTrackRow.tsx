/**
 * Effect Track Row — renders as a label in the left panel of the timeline.
 *
 * Shows: eye toggle (bypass), effect icon + name, expand arrow for keyframe sub-tracks.
 * Supports drag-and-drop reorder via parent.
 */

import React, { useCallback, useState } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useEffectBlockHistory } from '../../../hooks/useEffectBlockHistory';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, ChevronRight, X, GripVertical } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import type { EffectTrack } from '../../../types/effectBlock';
import { getEffect } from '../../../registry/effectRegistry';

interface EffectTrackRowProps {
  track: EffectTrack;
  isExpanded: boolean;
  /** Index within the owner's effectTracks array */
  index?: number;
}

export const EffectTrackRow: React.FC<EffectTrackRowProps> = React.memo(function EffectTrackRow({
  track,
  isExpanded,
  index,
}) {
  const toggleEffectBlockEnabled = useTimelineStore((s) => s.toggleEffectBlockEnabled);
  const toggleEffectTrackExpanded = useTimelineStore((s) => s.toggleEffectTrackExpanded);
  const removeEffectBlock = useTimelineStore((s) => s.removeEffectBlock);
  const selectEffectBlock = useTimelineStore((s) => s.selectEffectBlock);
  const reorderEffectTracks = useTimelineStore((s) => s.reorderEffectTracks);
  const moveEffectTrack = useTimelineStore((s) => s.moveEffectTrack);
  const selectedEffectBlockId = useTimelineStore((s) => s.view.selectedEffectBlockId);
  const { recordUpdate, recordRemove } = useEffectBlockHistory();
  const [isDragOver, setIsDragOver] = useState(false);

  const block = track.effectBlock;
  const entry = getEffect(block.effectType);
  const isSelected = selectedEffectBlockId === block.id;
  const Icon = entry?.icon;

  const handleToggleEnabled = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const beforeBlock = structuredClone(block);
    toggleEffectBlockEnabled(block.id);
    recordUpdate(block.id, beforeBlock);
  }, [block, toggleEffectBlockEnabled, recordUpdate]);

  const handleToggleExpanded = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleEffectTrackExpanded(block.id);
  }, [block.id, toggleEffectTrackExpanded]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    recordRemove(track.ownerId, block.id);
    removeEffectBlock(track.ownerId, block.id);
  }, [track.ownerId, block.id, removeEffectBlock, recordRemove]);

  const handleSelect = useCallback(() => {
    selectEffectBlock(block.id);
  }, [block.id, selectEffectBlock]);

  // Drag-and-drop for reorder / cross-owner move
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/effect-block-id', block.id as string);
    e.dataTransfer.setData('application/effect-owner-id', (track.ownerId ?? '__global__') as string);
    e.dataTransfer.setData('application/effect-index', String(index ?? 0));
    e.dataTransfer.effectAllowed = 'move';
  }, [block.id, track.ownerId, index]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/effect-block-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const draggedBlockId = e.dataTransfer.getData('application/effect-block-id');
    const sourceOwnerStr = e.dataTransfer.getData('application/effect-owner-id');
    if (!draggedBlockId || draggedBlockId === (block.id as string)) return;

    const sourceOwnerId = sourceOwnerStr === '__global__' ? null : sourceOwnerStr;
    const targetOwnerId = track.ownerId;
    const targetIndex = index ?? 0;

    if ((sourceOwnerId ?? '') === ((targetOwnerId ?? '') as string)) {
      // Same owner — reorder
      const sourceIndex = parseInt(e.dataTransfer.getData('application/effect-index'), 10);
      if (!isNaN(sourceIndex) && sourceIndex !== targetIndex) {
        reorderEffectTracks(targetOwnerId, sourceIndex, targetIndex);
      }
    } else {
      // Cross-owner move
      moveEffectTrack(
        draggedBlockId as import('../../../types/effectBlock').EffectBlockId,
        targetOwnerId,
        targetIndex,
      );
    }
  }, [block.id, track.ownerId, index, reorderEffectTracks, moveEffectTrack]);

  return (
    <div
      className={cn(
        'flex items-center pl-2 pr-1.5 min-h-[24px] border-b border-border/30 text-[10px] cursor-pointer',
        'hover:bg-muted/30',
        isSelected && 'bg-accent/30',
        !block.enabled && 'opacity-50',
        isDragOver && 'border-t-2 border-t-primary',
      )}
      onClick={handleSelect}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-effect-track="true"
      data-effect-owner-id={(track.ownerId ?? '__global__') as string}
    >
      {/* Drag handle */}
      <GripVertical className="w-2.5 h-2.5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab mr-0.5 shrink-0" />      {/* Expand arrow */}
      <button
        className="w-3 h-3 flex items-center justify-center text-muted-foreground hover:text-foreground mr-0.5 shrink-0"
        onClick={handleToggleExpanded}
      >
        <ChevronRight className={cn('w-2.5 h-2.5 transition-transform', isExpanded && 'rotate-90')} />
      </button>

      {/* Eye toggle */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
              onClick={handleToggleEnabled}
            >
              {block.enabled
                ? <Eye className="w-3 h-3" />
                : <EyeOff className="w-3 h-3 text-muted-foreground/50" />
              }
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>{block.enabled ? 'Disable effect' : 'Enable effect'}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Icon + name */}
      <div className="flex items-center gap-1 ml-1 flex-1 min-w-0">
        {Icon && <Icon className="w-3 h-3 text-muted-foreground shrink-0" />}
        <span className="truncate text-foreground/80">
          {entry?.name ?? block.effectType}
        </span>
      </div>

      {/* Delete */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="w-3 h-3 flex items-center justify-center text-muted-foreground/50 hover:text-destructive shrink-0 ml-1"
              onClick={handleRemove}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>Remove effect</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});
