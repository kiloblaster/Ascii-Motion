/**
 * Timeline Toolbar — playback controls and actions for the timeline view.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.2
 */

import React from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useTimelineHistory } from '../../../hooks/useTimelineHistory';
import { useLayerLimit } from '../../../hooks/useLayerLimit';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import {
  Plus,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronsLeft,
  ChevronsRight,
  Repeat,
} from 'lucide-react';

export const TimelineToolbar: React.FC = () => {
  const isPlaying = useTimelineStore((s) => s.view.isPlaying);
  const looping = useTimelineStore((s) => s.view.looping);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const goToFrame = useTimelineStore((s) => s.goToFrame);
  const nextFrame = useTimelineStore((s) => s.nextFrame);
  const previousFrame = useTimelineStore((s) => s.previousFrame);
  const setPlaying = useTimelineStore((s) => s.setPlaying);
  const setLooping = useTimelineStore((s) => s.setLooping);
  const { canAddLayer } = useLayerLimit();
  const { addLayer } = useTimelineHistory();

  const handleAddLayer = () => {
    if (canAddLayer) {
      addLayer();
    }
  };

  return (
    <TooltipProvider>
    <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 border-b border-border/50 bg-muted/30">
      {/* Add layer */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5"
            onClick={handleAddLayer}
            disabled={!canAddLayer}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {canAddLayer ? 'Add layer' : 'Layer limit reached — upgrade for more'}
        </TooltipContent>
      </Tooltip>

      <div className="w-px h-4 bg-border mx-1" />

      {/* Playback controls */}
      <Button variant="ghost" size="sm" className="h-6 px-1" onClick={() => goToFrame(0)}>
        <ChevronsLeft className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="sm" className="h-6 px-1" onClick={previousFrame}>
        <SkipBack className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-1.5"
        onClick={() => setPlaying(!isPlaying)}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </Button>
      <Button variant="ghost" size="sm" className="h-6 px-1" onClick={nextFrame}>
        <SkipForward className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-1"
        onClick={() => goToFrame(durationFrames - 1)}
      >
        <ChevronsRight className="w-3.5 h-3.5" />
      </Button>

      {/* Loop toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={looping ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 px-1"
            onClick={() => setLooping(!looping)}
          >
            <Repeat className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {looping ? 'Looping on' : 'Looping off'}
        </TooltipContent>
      </Tooltip>

      {/* Frame info */}
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
        {currentFrame + 1} / {durationFrames} · {frameRate} fps
      </span>
    </div>
    </TooltipProvider>
  );
};
