/**
 * Timeline Toolbar — playback controls, frame operations, and timeline info.
 * 
 * Layout (left → right):
 *  1. Onion skin controls
 *  2. Divider
 *  3. Frame editing buttons (add, duplicate, split, delete, set start/end, hide)
 *  4. Center: playback controls (first/prev/play/next/last/loop) + timecode
 *  5. Right: frame counter + fps control
 * 
 * Button sizing matches the canvas settings header (h-7, text-xs).
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
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
import { TimelineDurationInput } from './TimecodeDisplay';
import { FrameRateControl } from './FrameRateControl';
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

// Button class matching canvas header height
const BTN = "h-7 px-1.5";
const BTN_ICON = "w-3.5 h-3.5";

export const TimelineToolbar: React.FC = () => {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const looping = useTimelineStore((s) => s.view.looping);
  const setLooping = useTimelineStore((s) => s.setLooping);
  const {
    addContentFrame,
    removeContentFrame,
    splitContentFrame,
    updateContentFrameTiming,
  } = useTimelineHistory();

  const layers = useTimelineStore((s) => s.layers);
  const frames = useAnimationStore((s) => s.frames);
  const canPlay = layers.length > 0 || frames.length > 0;
  const { startOptimizedPlayback, stopOptimizedPlayback } = useOptimizedPlayback();
  const playbackSnapshot = usePlaybackOnlySnapshot();
  const isPlaybackActive = playbackSnapshot.isActive;

  const { navigateNext, navigatePrevious, navigateFirst, navigateLast } = useFrameNavigation();

  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? layers[0] ?? null;
  const contentFrameAtPlayhead = activeLayer
    ? getContentFrameAtTime(activeLayer, currentFrame)
    : null;

  const selectedContentFrameIds = useTimelineStore((s) => s.view.selectedContentFrameIds);
  const hasSelection = selectedContentFrameIds.size > 0;

  const canSplit = contentFrameAtPlayhead
    ? currentFrame > contentFrameAtPlayhead.startFrame
    : false;

  // ── Frame operations ──

  const handleAddFrame = useCallback(() => {
    if (!activeLayer || isPlaybackActive) return;
    const cf = contentFrameAtPlayhead;
    if (!cf) {
      addContentFrame(activeLayer.id, currentFrame, 1);
      return;
    }
    const leftDuration = currentFrame - cf.startFrame;
    const rightStart = currentFrame + 1;
    const rightDuration = (cf.startFrame + cf.durationFrames) - rightStart;
    if (leftDuration > 0) {
      updateContentFrameTiming(activeLayer.id, cf.id, cf.startFrame, leftDuration);
    } else {
      removeContentFrame(activeLayer.id, cf.id);
    }
    addContentFrame(activeLayer.id, currentFrame, 1);
    if (rightDuration > 0) {
      const rightData = new Map(cf.data);
      addContentFrame(activeLayer.id, rightStart, rightDuration, rightData);
    }
  }, [activeLayer, isPlaybackActive, contentFrameAtPlayhead, currentFrame, addContentFrame, updateContentFrameTiming, removeContentFrame]);

  const handleDuplicateFrame = useCallback(() => {
    if (!activeLayer || isPlaybackActive) return;
    const selectedIds = useTimelineStore.getState().view.selectedContentFrameIds;
    if (selectedIds.size > 0) {
      const selectedFrames = activeLayer.contentFrames
        .filter((cf) => selectedIds.has(cf.id))
        .sort((a, b) => a.startFrame - b.startFrame);
      if (selectedFrames.length === 0) return;
      const firstStart = selectedFrames[0].startFrame;
      const lastEnd = selectedFrames[selectedFrames.length - 1].startFrame + selectedFrames[selectedFrames.length - 1].durationFrames;
      const insertAt = lastEnd;
      for (const cf of selectedFrames) {
        const offset = cf.startFrame - firstStart;
        addContentFrame(activeLayer.id, insertAt + offset, cf.durationFrames, new Map(cf.data));
      }
      return;
    }
    const cf = contentFrameAtPlayhead;
    if (!cf) return;
    const insertAt = cf.startFrame + cf.durationFrames;
    addContentFrame(activeLayer.id, insertAt, cf.durationFrames, new Map(cf.data));
  }, [activeLayer, isPlaybackActive, contentFrameAtPlayhead, addContentFrame]);

  const handleSplitFrame = useCallback(() => {
    if (!activeLayer || isPlaybackActive || !contentFrameAtPlayhead || !canSplit) return;
    splitContentFrame(activeLayer.id, contentFrameAtPlayhead.id, currentFrame);
  }, [activeLayer, isPlaybackActive, contentFrameAtPlayhead, canSplit, currentFrame, splitContentFrame]);

  const syncCanvasAfterTimingChange = useCallback(() => {
    if (!activeLayer) return;
    const newCf = getContentFrameAtTime(activeLayer, currentFrame);
    if (newCf) {
      useCanvasStore.getState().setCanvasData(new Map(newCf.data));
    } else {
      useCanvasStore.getState().setCanvasData(new Map());
    }
  }, [activeLayer, currentFrame]);

  const handleDeleteFrame = useCallback(() => {
    if (!activeLayer || isPlaybackActive) return;
    const selectedIds = useTimelineStore.getState().view.selectedContentFrameIds;
    if (selectedIds.size > 0) {
      const selectedArr = [...selectedIds];
      for (const cfId of selectedArr) {
        removeContentFrame(activeLayer.id, cfId);
      }
      useTimelineStore.getState().selectContentFrames([]);
      syncCanvasAfterTimingChange();
      return;
    }
    const cf = contentFrameAtPlayhead;
    if (cf) {
      removeContentFrame(activeLayer.id, cf.id);
      syncCanvasAfterTimingChange();
    }
  }, [activeLayer, isPlaybackActive, contentFrameAtPlayhead, removeContentFrame, syncCanvasAfterTimingChange]);

  const handleTogglePlayback = useCallback(() => {
    if (isPlaybackActive) {
      stopOptimizedPlayback();
    } else {
      startOptimizedPlayback();
    }
  }, [isPlaybackActive, startOptimizedPlayback, stopOptimizedPlayback]);

  const hasSingleSelection = selectedContentFrameIds.size === 1;
  const singleSelectedFrame = hasSingleSelection
    ? activeLayer?.contentFrames.find((cf) => selectedContentFrameIds.has(cf.id)) ?? null
    : null;

  const handleSetFrameStart = useCallback(() => {
    if (!activeLayer || isPlaybackActive || !singleSelectedFrame) return;
    const cf = singleSelectedFrame;
    const cfEnd = cf.startFrame + cf.durationFrames;
    if (currentFrame >= cfEnd) return;
    const newDuration = cfEnd - currentFrame;
    updateContentFrameTiming(activeLayer.id, cf.id, currentFrame, newDuration);
    syncCanvasAfterTimingChange();
  }, [activeLayer, isPlaybackActive, singleSelectedFrame, currentFrame, updateContentFrameTiming, syncCanvasAfterTimingChange]);

  const handleSetFrameEnd = useCallback(() => {
    if (!activeLayer || isPlaybackActive || !singleSelectedFrame) return;
    const cf = singleSelectedFrame;
    if (currentFrame <= cf.startFrame) return;
    const newDuration = currentFrame - cf.startFrame;
    if (newDuration <= 0) {
      removeContentFrame(activeLayer.id, cf.id);
    } else {
      updateContentFrameTiming(activeLayer.id, cf.id, cf.startFrame, newDuration);
    }
    syncCanvasAfterTimingChange();
  }, [activeLayer, isPlaybackActive, singleSelectedFrame, currentFrame, updateContentFrameTiming, removeContentFrame, syncCanvasAfterTimingChange]);

  return (
    <TooltipProvider>
    <div className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 border-b border-border/50 bg-muted/30">

      {/* Left: Frame editing buttons */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={handleAddFrame} disabled={isPlaybackActive || !activeLayer}>
              <FilePlus2 className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Add frame block at playhead (⌘N)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={handleDuplicateFrame} disabled={isPlaybackActive || (!hasSelection && !contentFrameAtPlayhead)}>
              <Copy className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Duplicate frame block (⌘D)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={handleSplitFrame} disabled={isPlaybackActive || !canSplit}>
              <Scissors className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Split frame block at playhead (⌘X)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={`${BTN} text-destructive hover:text-destructive`}
              onClick={handleDeleteFrame} disabled={isPlaybackActive || (!hasSelection && !contentFrameAtPlayhead)}>
              <Trash2 className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Delete frame block (⌘⌫)</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border/50 mx-0.5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={handleSetFrameStart} disabled={isPlaybackActive || !hasSingleSelection}>
              <ArrowLeftToLine className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Set selected frame start to playhead (⌘,)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={handleSetFrameEnd} disabled={isPlaybackActive || !hasSingleSelection}>
              <ArrowRightToLine className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Set selected frame end to playhead (⌘.)</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border/50 mx-0.5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={() => {
                if (!activeLayer || isPlaybackActive) return;
                const selectedIds = useTimelineStore.getState().view.selectedContentFrameIds;
                if (selectedIds.size === 0) return;
                const selectedArr = [...selectedIds];
                const lastId = selectedArr[selectedArr.length - 1];
                const lastCf = activeLayer.contentFrames.find((cf) => cf.id === lastId);
                const newHidden = !(lastCf?.hidden ?? false);
                useTimelineStore.getState().toggleContentFrameHidden(activeLayer.id, selectedArr, newHidden);
              }}
              disabled={isPlaybackActive || !hasSelection}>
              {(() => {
                if (!activeLayer || !hasSelection) return <Eye className={BTN_ICON} />;
                const selectedArr = [...selectedContentFrameIds];
                const lastId = selectedArr[selectedArr.length - 1];
                const lastCf = activeLayer.contentFrames.find((cf) => cf.id === lastId);
                return lastCf?.hidden
                  ? <EyeOff className={`${BTN_ICON} text-muted-foreground`} />
                  : <Eye className={BTN_ICON} />;
              })()}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Hide/show selected frame(s)</TooltipContent>
        </Tooltip>
      </div>

      {/* Center: playback controls */}
      <div className="flex-1 flex items-center justify-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={navigateFirst} disabled={isPlaybackActive || currentFrame === 0}>
              <SkipBack className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">First frame (Shift+&lt;)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={navigatePrevious} disabled={isPlaybackActive || currentFrame === 0}>
              <StepBack className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Previous frame (,)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={isPlaybackActive ? 'default' : 'ghost'} size="sm" className={BTN}
              onClick={handleTogglePlayback} disabled={!canPlay}>
              {isPlaybackActive ? <Pause className={BTN_ICON} /> : <Play className={BTN_ICON} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{isPlaybackActive ? 'Pause (Space)' : 'Play (Space)'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={navigateNext} disabled={isPlaybackActive || currentFrame === durationFrames - 1}>
              <StepForward className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Next frame (.)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={BTN}
              onClick={navigateLast} disabled={isPlaybackActive || currentFrame === durationFrames - 1}>
              <SkipForward className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Last frame (Shift+&gt;)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm"
              className={looping ? `${BTN} text-purple-500 hover:text-purple-400` : BTN}
              onClick={() => setLooping(!looping)}>
              <RotateCcw className={BTN_ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{looping ? 'Disable loop' : 'Enable loop'}</TooltipContent>
        </Tooltip>

        <div className="ml-1">
          <TimecodeDisplay />
        </div>
      </div>

      {/* Right: Length + fps */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <TimelineDurationInput />
        <div className="w-px h-5 bg-border/50" />
        <FrameRateControl />
      </div>
    </div>
    </TooltipProvider>
  );
};
