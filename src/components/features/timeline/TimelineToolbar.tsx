/**
 * Timeline Toolbar — playback controls and actions for the timeline view.
 * 
 * Uses the same playback system as the Frames view (useOptimizedPlayback)
 * so that play/pause actually drives frame advancement and canvas rendering.
 * Button styling and tooltips match PlaybackControls.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.2
 */

import React, { useCallback } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useTimelineHistory } from '../../../hooks/useTimelineHistory';
import { useLayerLimit } from '../../../hooks/useLayerLimit';
import { useFrameNavigation } from '../../../hooks/useFrameNavigation';
import { useOptimizedPlayback } from '../../../hooks/useOptimizedPlayback';
import { usePlaybackOnlySnapshot } from '../../../hooks/usePlaybackOnlySnapshot';
import { useAnimationStore } from '../../../stores/animationStore';
import { getContentFrameAtTime } from '../../../utils/layerCompositing';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import {
  Plus,
  FilePlus2,
  Copy,
  Scissors,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  RotateCcw,
} from 'lucide-react';

export const TimelineToolbar: React.FC = () => {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const looping = useTimelineStore((s) => s.view.looping);
  const setLooping = useTimelineStore((s) => s.setLooping);
  const goToFrame = useTimelineStore((s) => s.goToFrame);
  const { canAddLayer } = useLayerLimit();
  const {
    addLayer,
    addContentFrame,
    removeContentFrame,
    duplicateContentFrame,
    splitContentFrame,
    updateContentFrameTiming,
    updateContentFrameData,
  } = useTimelineHistory();

  // Use the real playback system (same as Frames view)
  const layers = useTimelineStore((s) => s.layers);
  const frames = useAnimationStore((s) => s.frames);
  const canPlay = layers.length > 0 || frames.length > 0;
  const { startOptimizedPlayback, stopOptimizedPlayback } = useOptimizedPlayback();
  const playbackSnapshot = usePlaybackOnlySnapshot();
  const isPlaybackActive = playbackSnapshot.isActive;

  // Use shared frame navigation (guards against playback mode, text tool, etc.)
  const { navigateNext, navigatePrevious, navigateFirst, navigateLast } = useFrameNavigation();

  // Active layer + content frame at playhead (for frame block operations)
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? layers[0] ?? null;
  const contentFrameAtPlayhead = activeLayer
    ? getContentFrameAtTime(activeLayer, currentFrame)
    : null;

  // Can we split? Only if playhead is strictly inside (not at first frame of) a content frame
  const canSplit = contentFrameAtPlayhead
    ? currentFrame > contentFrameAtPlayhead.startFrame
    : false;

  const handleAddLayer = () => {
    if (canAddLayer) {
      addLayer();
    }
  };

  /** Add a new empty 1-frame content frame at the playhead.
   *  - Gap: insert directly.
   *  - On existing frame: carve out the single frame at the playhead, replacing
   *    it with a blank, keeping left/right remnants of the original. */
  const handleAddFrame = useCallback(() => {
    if (!activeLayer || isPlaybackActive) return;

    const cf = contentFrameAtPlayhead;
    if (!cf) {
      // Gap — just insert
      addContentFrame(activeLayer.id, currentFrame, 1);
      return;
    }

    // Existing frame at playhead — carve it out
    const leftDuration = currentFrame - cf.startFrame;
    const rightStart = currentFrame + 1;
    const rightDuration = (cf.startFrame + cf.durationFrames) - rightStart;

    if (cf.durationFrames === 1) {
      // Frame is already 1 frame long — just replace its data with empty
      updateContentFrameData(activeLayer.id, cf.id, new Map());
      return;
    }

    // Shrink original to the left remnant (or remove if no left portion)
    if (leftDuration > 0) {
      updateContentFrameTiming(activeLayer.id, cf.id, cf.startFrame, leftDuration);
    } else {
      // No left portion — shift original to become the right remnant
      if (rightDuration > 0) {
        updateContentFrameTiming(activeLayer.id, cf.id, rightStart, rightDuration);
      } else {
        // Shouldn't happen (handled by durationFrames === 1 above)
        removeContentFrame(activeLayer.id, cf.id);
      }
    }

    // Add the right remnant as a new frame (only if left portion consumed the original)
    if (leftDuration > 0 && rightDuration > 0) {
      addContentFrame(activeLayer.id, rightStart, rightDuration, new Map(cf.data));
    }

    // Insert the new blank frame at the playhead
    addContentFrame(activeLayer.id, currentFrame, 1);
  }, [activeLayer, isPlaybackActive, currentFrame, contentFrameAtPlayhead,
      addContentFrame, updateContentFrameTiming, updateContentFrameData, removeContentFrame]);

  /** Duplicate the content frame block at the playhead. */
  const handleDuplicateFrame = useCallback(() => {
    if (!activeLayer || !contentFrameAtPlayhead || isPlaybackActive) return;
    duplicateContentFrame(activeLayer.id, contentFrameAtPlayhead.id);
  }, [activeLayer, contentFrameAtPlayhead, isPlaybackActive, duplicateContentFrame]);

  /** Split the content frame block at the playhead into two. */
  const handleSplitFrame = useCallback(() => {
    if (!activeLayer || !contentFrameAtPlayhead || !canSplit || isPlaybackActive) return;
    splitContentFrame(activeLayer.id, contentFrameAtPlayhead.id, currentFrame);
  }, [activeLayer, contentFrameAtPlayhead, canSplit, isPlaybackActive, currentFrame, splitContentFrame]);

  const handleTogglePlayback = useCallback(() => {
    if (isPlaybackActive) {
      stopOptimizedPlayback({ preserveFrameIndex: true });
    } else {
      startOptimizedPlayback();
    }
  }, [isPlaybackActive, startOptimizedPlayback, stopOptimizedPlayback]);

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

      {/* Content frame block operations */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={handleAddFrame}
            disabled={isPlaybackActive || !activeLayer}
          >
            <FilePlus2 className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Add frame block at playhead</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={handleDuplicateFrame}
            disabled={isPlaybackActive || !contentFrameAtPlayhead}
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Duplicate frame block</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={handleSplitFrame}
            disabled={isPlaybackActive || !canSplit}
          >
            <Scissors className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Split frame block at playhead</TooltipContent>
      </Tooltip>

      <div className="w-px h-4 bg-border mx-1" />

      {/* First frame */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={navigateFirst}
            disabled={isPlaybackActive || currentFrame === 0}
          >
            <SkipBack className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">First frame (Shift+&lt;)</TooltipContent>
      </Tooltip>

      {/* Previous frame */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={navigatePrevious}
            disabled={isPlaybackActive || currentFrame === 0}
          >
            <StepBack className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Previous frame (,)</TooltipContent>
      </Tooltip>

      {/* Play / Pause */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isPlaybackActive ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-1.5"
            onClick={handleTogglePlayback}
            disabled={!canPlay}
          >
            {isPlaybackActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isPlaybackActive ? 'Pause (Space)' : 'Play (Space)'}
        </TooltipContent>
      </Tooltip>

      {/* Next frame */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={navigateNext}
            disabled={isPlaybackActive || currentFrame === durationFrames - 1}
          >
            <StepForward className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Next frame (.)</TooltipContent>
      </Tooltip>

      {/* Last frame */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={navigateLast}
            disabled={isPlaybackActive || currentFrame === durationFrames - 1}
          >
            <SkipForward className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Last frame (Shift+&gt;)</TooltipContent>
      </Tooltip>

      {/* Loop toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={looping ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 px-1"
            onClick={() => setLooping(!looping)}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {looping ? 'Disable loop' : 'Enable loop'}
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
