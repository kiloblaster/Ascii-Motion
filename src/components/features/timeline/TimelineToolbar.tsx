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
import { useFrameNavigation } from '../../../hooks/useFrameNavigation';
import { useOptimizedPlayback } from '../../../hooks/useOptimizedPlayback';
import { usePlaybackOnlySnapshot } from '../../../hooks/usePlaybackOnlySnapshot';
import { useAnimationStore } from '../../../stores/animationStore';
import { useCanvasStore } from '../../../stores/canvasStore';
import { getContentFrameAtTime } from '../../../utils/layerCompositing';
import { TimecodeDisplay } from './TimecodeDisplay';
import { OnionSkinControls } from '../OnionSkinControls';
import { LayerMenu } from './LayerMenu';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import {
  FilePlus2,
  Copy,
  Scissors,
  Trash2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  RotateCcw,
  ArrowLeftToLine,
  ArrowRightToLine,
  Eye,
  EyeOff,
} from 'lucide-react';

export const TimelineToolbar: React.FC = () => {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const looping = useTimelineStore((s) => s.view.looping);
  const setLooping = useTimelineStore((s) => s.setLooping);
  const {
    addContentFrame,
    removeContentFrame,
    duplicateContentFrame: _duplicateContentFrame,
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

  // Selected content frames
  const selectedContentFrameIds = useTimelineStore((s) => s.view.selectedContentFrameIds);
  const hasSelection = selectedContentFrameIds.size > 0;

  // Can we split? Only if playhead is strictly inside (not at first frame of) a content frame
  const canSplit = contentFrameAtPlayhead
    ? currentFrame > contentFrameAtPlayhead.startFrame
    : false;

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
      // Frame is already 1 frame long — add a new blank frame after it
      // (ensureTimelineContains inside addContentFrame will extend the timeline if needed)
      const afterEnd = cf.startFrame + 1;
      addContentFrame(activeLayer.id, afterEnd, 1);
      useTimelineStore.getState().goToFrame(afterEnd);
      return;
    }

    // If playhead is on the last frame of the block, add after instead of carving
    const isLastFrame = currentFrame === cf.startFrame + cf.durationFrames - 1;
    if (isLastFrame) {
      const afterEnd = cf.startFrame + cf.durationFrames;
      addContentFrame(activeLayer.id, afterEnd, 1);
      useTimelineStore.getState().goToFrame(afterEnd);
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

  /** Duplicate selected content frame blocks (or the one at playhead).
   *  Places duplicates after the last selected frame.
   *  Pushes any later frames to make room. */
  const handleDuplicateFrame = useCallback(() => {
    if (!activeLayer || isPlaybackActive) return;

    // Gather the frames to duplicate: either selected ones or the one at playhead
    const framesToDup = hasSelection
      ? activeLayer.contentFrames
          .filter((cf) => selectedContentFrameIds.has(cf.id))
          .sort((a, b) => a.startFrame - b.startFrame)
      : contentFrameAtPlayhead
        ? [contentFrameAtPlayhead]
        : [];

    if (framesToDup.length === 0) return;

    // Total duration of the block to duplicate
    const totalDupDuration = framesToDup.reduce((sum, cf) => sum + cf.durationFrames, 0);
    const lastEnd = Math.max(...framesToDup.map((cf) => cf.startFrame + cf.durationFrames));
    const insertAt = lastEnd;

    // Push all content frames on this layer that start at or after insertAt
    // by totalDupDuration frames to make room
    const framesToPush = activeLayer.contentFrames
      .filter((cf) => cf.startFrame >= insertAt && !selectedContentFrameIds.has(cf.id))
      .sort((a, b) => b.startFrame - a.startFrame); // push from right to left to avoid overlaps

    for (const cf of framesToPush) {
      updateContentFrameTiming(activeLayer.id, cf.id, cf.startFrame + totalDupDuration, cf.durationFrames);
    }

    // Insert duplicates sequentially after the selection
    let offset = 0;
    for (const cf of framesToDup) {
      addContentFrame(activeLayer.id, insertAt + offset, cf.durationFrames, new Map(cf.data));
      offset += cf.durationFrames;
    }
  }, [activeLayer, isPlaybackActive, hasSelection, selectedContentFrameIds, contentFrameAtPlayhead,
      addContentFrame, updateContentFrameTiming]);

  /** Split the content frame block at the playhead into two. */
  const handleSplitFrame = useCallback(() => {
    if (!activeLayer || !contentFrameAtPlayhead || !canSplit || isPlaybackActive) return;
    splitContentFrame(activeLayer.id, contentFrameAtPlayhead.id, currentFrame);
  }, [activeLayer, contentFrameAtPlayhead, canSplit, isPlaybackActive, currentFrame, splitContentFrame]);

  /** Delete selected content frame blocks (or the one at playhead). */
  const handleDeleteFrame = useCallback(() => {
    if (!activeLayer || isPlaybackActive) return;

    if (hasSelection) {
      // Delete all selected frames
      const selectedOnLayer = activeLayer.contentFrames.filter((cf) =>
        selectedContentFrameIds.has(cf.id),
      );
      for (const cf of selectedOnLayer) {
        removeContentFrame(activeLayer.id, cf.id);
      }
      useTimelineStore.getState().clearContentFrameSelection();
    } else if (contentFrameAtPlayhead) {
      removeContentFrame(activeLayer.id, contentFrameAtPlayhead.id);
    }
  }, [activeLayer, isPlaybackActive, hasSelection, selectedContentFrameIds, contentFrameAtPlayhead, removeContentFrame]);

  const handleTogglePlayback = useCallback(() => {
    if (isPlaybackActive) {
      stopOptimizedPlayback({ preserveFrameIndex: true });
    } else {
      startOptimizedPlayback();
    }
  }, [isPlaybackActive, startOptimizedPlayback, stopOptimizedPlayback]);

  // The "selected" content frame for set-start/set-end operations.
  // This is the explicitly clicked frame (from selectedContentFrameIds), NOT the frame under playhead.
  // Only enabled when exactly 1 frame is selected.
  const singleSelectedFrame = (() => {
    if (selectedContentFrameIds.size !== 1 || !activeLayer) return null;
    const selectedId = [...selectedContentFrameIds][0];
    return activeLayer.contentFrames.find((cf) => cf.id === selectedId) ?? null;
  })();
  const hasSingleSelection = singleSelectedFrame !== null;

  /** After changing content frame timing, reload canvas if the frame now covers the playhead */
  const syncCanvasAfterTimingChange = useCallback(() => {
    if (!activeLayer) return;
    const updatedLayer = useTimelineStore.getState().layers.find((l) => l.id === activeLayer.id);
    if (!updatedLayer) return;
    const cf = getContentFrameAtTime(updatedLayer, currentFrame);
    if (cf) {
      useCanvasStore.getState().setCanvasData(new Map(cf.data));
    }
  }, [activeLayer, currentFrame]);

  // Set SELECTED content frame's start/end to playhead (can extend beyond current bounds)
  const handleSetFrameStart = useCallback(() => {
    if (!activeLayer || isPlaybackActive || !singleSelectedFrame) return;
    const cf = singleSelectedFrame;
    const cfEnd = cf.startFrame + cf.durationFrames;
    if (currentFrame >= cfEnd) {
      // Start past end → 1 frame at end
      updateContentFrameTiming(activeLayer.id, cf.id, cfEnd - 1, 1);
    } else {
      // Move start to playhead — trim any overlapping frames in the way
      const newStart = currentFrame;
      const newDuration = cfEnd - newStart;

      // Remove or trim any content frames that would overlap [newStart, cfEnd)
      for (const other of activeLayer.contentFrames) {
        if (other.id === cf.id) continue;
        const otherEnd = other.startFrame + other.durationFrames;
        if (other.startFrame >= newStart && otherEnd <= cfEnd) {
          // Fully enveloped — remove
          removeContentFrame(activeLayer.id, other.id);
        } else if (other.startFrame < newStart && otherEnd > newStart && otherEnd <= cfEnd) {
          // Overlaps from the left — trim its end
          updateContentFrameTiming(activeLayer.id, other.id, other.startFrame, newStart - other.startFrame);
        }
      }

      updateContentFrameTiming(activeLayer.id, cf.id, newStart, newDuration);
    }
    syncCanvasAfterTimingChange();
  }, [activeLayer, isPlaybackActive, singleSelectedFrame, currentFrame, updateContentFrameTiming, removeContentFrame, syncCanvasAfterTimingChange]);

  const handleSetFrameEnd = useCallback(() => {
    if (!activeLayer || isPlaybackActive || !singleSelectedFrame) return;
    const cf = singleSelectedFrame;
    if (currentFrame < cf.startFrame) {
      // End before start → 1 frame at start
      updateContentFrameTiming(activeLayer.id, cf.id, cf.startFrame, 1);
    } else {
      // Set end to playhead (inclusive) — trim any overlapping frames in the way
      const newEnd = currentFrame + 1;
      const newDuration = newEnd - cf.startFrame;

      // Remove or trim any content frames that would overlap [cf.startFrame, newEnd)
      for (const other of activeLayer.contentFrames) {
        if (other.id === cf.id) continue;
        const otherEnd = other.startFrame + other.durationFrames;
        if (other.startFrame >= cf.startFrame && otherEnd <= newEnd) {
          // Fully enveloped — remove
          removeContentFrame(activeLayer.id, other.id);
        } else if (other.startFrame >= cf.startFrame && other.startFrame < newEnd && otherEnd > newEnd) {
          // Overlaps from the right — push its start past the new end
          const trimmedStart = newEnd;
          const trimmedDuration = otherEnd - trimmedStart;
          updateContentFrameTiming(activeLayer.id, other.id, trimmedStart, trimmedDuration);
        }
      }

      updateContentFrameTiming(activeLayer.id, cf.id, cf.startFrame, newDuration);
    }
    syncCanvasAfterTimingChange();
  }, [activeLayer, isPlaybackActive, singleSelectedFrame, currentFrame, updateContentFrameTiming, removeContentFrame, syncCanvasAfterTimingChange]);

  return (
    <TooltipProvider>
    <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 border-b border-border/50 bg-muted/30">
      {/* Layer operations menu */}
      <LayerMenu />
      <div className="w-px h-4 bg-border/50 mx-0.5" />

      {/* Left group: frame block operations */}
      <div className="flex items-center gap-0.5">
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
        <TooltipContent side="top">Add frame block at playhead (⌘N)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={handleDuplicateFrame}
            disabled={isPlaybackActive || (!hasSelection && !contentFrameAtPlayhead)}
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Duplicate frame block (⌘D)</TooltipContent>
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
        <TooltipContent side="top">Split frame block at playhead (⌘X)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1 text-destructive hover:text-destructive"
            onClick={handleDeleteFrame}
            disabled={isPlaybackActive || (!hasSelection && !contentFrameAtPlayhead)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Delete frame block (⌘⌫)</TooltipContent>
      </Tooltip>

      <div className="w-px h-4 bg-border/50 mx-0.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={handleSetFrameStart}
            disabled={isPlaybackActive || !hasSingleSelection}
          >
            <ArrowLeftToLine className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Set selected frame start to playhead (⌘,)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={handleSetFrameEnd}
            disabled={isPlaybackActive || !hasSingleSelection}
          >
            <ArrowRightToLine className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Set selected frame end to playhead (⌘.)</TooltipContent>
      </Tooltip>

      <div className="w-px h-4 bg-border/50 mx-0.5" />

      {/* Hide/Show selected frame(s) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={() => {
              if (!activeLayer || isPlaybackActive) return;
              const selectedIds = useTimelineStore.getState().view.selectedContentFrameIds;
              if (selectedIds.size === 0) return;
              // Use the last-added frame's state to determine toggle direction
              const selectedArr = [...selectedIds];
              const lastId = selectedArr[selectedArr.length - 1];
              const lastCf = activeLayer.contentFrames.find((cf) => cf.id === lastId);
              const newHidden = !(lastCf?.hidden ?? false);
              useTimelineStore.getState().toggleContentFrameHidden(
                activeLayer.id,
                selectedArr,
                newHidden,
              );
            }}
            disabled={isPlaybackActive || !hasSelection}
          >
            {(() => {
              if (!activeLayer || !hasSelection) return <Eye className="w-3.5 h-3.5" />;
              const selectedArr = [...selectedContentFrameIds];
              const lastId = selectedArr[selectedArr.length - 1];
              const lastCf = activeLayer.contentFrames.find((cf) => cf.id === lastId);
              return lastCf?.hidden
                ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                : <Eye className="w-3.5 h-3.5" />;
            })()}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Hide/show selected frame(s)</TooltipContent>
      </Tooltip>
      </div>

      {/* Center group: playback controls (truly centered) + timecode (grows right) */}
      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center">
      {/* Left spacer column */}
      <div />
      {/* Center column: playback buttons — always centered regardless of timecode width */}
      <div className="flex items-center gap-0.5 justify-self-center">

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
            variant="ghost"
            size="sm"
            className={looping ? 'h-6 px-1 text-purple-500 hover:text-purple-400' : 'h-6 px-1'}
            onClick={() => setLooping(!looping)}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {looping ? 'Disable loop' : 'Enable loop'}
        </TooltipContent>
      </Tooltip>
      </div>

      {/* Right column: timecode — left-aligned, grows right without shifting buttons */}
      <div className="justify-self-start pl-1">
        <TimecodeDisplay />
      </div>
      </div>

      {/* Right group: onion skin */}
      <OnionSkinControls />
    </div>
    </TooltipProvider>
  );
};
