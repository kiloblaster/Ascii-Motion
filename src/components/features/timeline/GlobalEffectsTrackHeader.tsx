/**
 * Global Effects Track Header — rendered at the top of the layer list.
 *
 * Provides "Global Effects" label with expand/collapse and "Add Effect" dropdown.
 */

import React from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { cn } from '@/lib/utils';
import { ChevronRight, Plus, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Button } from '../../ui/button';
import { getAllEffects } from '../../../registry/effectRegistry';
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
  const [isDragOverHeader, setIsDragOverHeader] = React.useState(false);

  const registeredEffects = getAllEffects();

  if (globalEffects.length === 0 && registeredEffects.length === 0) return null;

  return (
    <div className="border-b border-border/60">
      {/* Header row — also a drop target for dragging effects to global */}
      <div
        className={cn(
          'flex items-center px-2 min-h-[28px] bg-muted/30 cursor-pointer',
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
          moveEffectTrack(
            draggedBlockId as import('../../../types/effectBlock').EffectBlockId,
            null,
          );
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
          {expandedEffectTrackIds.has(track.effectBlock.id) && track.effectBlock.propertyTracks.map((pt) => (
            <div
              key={pt.id}
              className="flex items-center px-3 min-h-[20px] border-b border-border/20 text-[9px] text-muted-foreground/60"
            >
              {pt.propertyPath}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};
