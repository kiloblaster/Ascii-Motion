/**
 * Timeline Ruler — frame number ruler with click-to-seek and playhead.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.7
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useToolStore } from '../../../stores/toolStore';
import { usePlaybackOnlySnapshot } from '../../../hooks/usePlaybackOnlySnapshot';
import { cn } from '@/lib/utils';
import type { TimelineDurationChangeHistoryAction } from '../../../types';

/** Pixels per frame at zoom=1 */
const BASE_PX_PER_FRAME = 12;
/** Minimum timeline length in frames */
const MIN_DURATION = 1;

export const TimelineRuler: React.FC = () => {
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const zoom = useTimelineStore((s) => s.view.zoom);
  const scrollX = useTimelineStore((s) => s.view.scrollX);
  const goToFrame = useTimelineStore((s) => s.goToFrame);
  const setDuration = useTimelineStore((s) => s.setDuration);
  const pushToHistory = useToolStore((s) => s.pushToHistory);

  // Work area state
  const workAreaStart = useTimelineStore((s) => s.view.workAreaStart);
  const workAreaEnd = useTimelineStore((s) => s.view.workAreaEnd);
  const workAreaEnabled = useTimelineStore((s) => s.view.workAreaEnabled);
  const setWorkAreaStart = useTimelineStore((s) => s.setWorkAreaStart);
  const setWorkAreaEnd = useTimelineStore((s) => s.setWorkAreaEnd);

  // Playback position (updates during optimized playback without React re-renders)
  const { isActive: isPlaybackActive, currentFrameIndex: playbackFrame } = usePlaybackOnlySnapshot();

  const rulerRef = useRef<HTMLDivElement>(null);
  const pxPerFrame = BASE_PX_PER_FRAME * zoom;
  const totalWidth = durationFrames * pxPerFrame;
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingEnd, setIsDraggingEnd] = useState(false);

  /** Convert a clientX position to a clamped frame index */
  const clientXToFrame = useCallback(
    (clientX: number) => {
      if (!rulerRef.current) return 0;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = clientX - rect.left + scrollX;
      const frame = Math.floor(x / pxPerFrame);
      return Math.max(0, Math.min(durationFrames - 1, frame));
    },
    [pxPerFrame, scrollX, durationFrames],
  );

  /** Click or mousedown starts navigation + drag‑to‑scrub */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // left button only
      e.preventDefault();
      const frame = clientXToFrame(e.clientX);
      goToFrame(frame);
      setIsDragging(true);
    },
    [clientXToFrame, goToFrame],
  );

  // ── End-bracket (duration) drag ──

  /** Convert clientX to an unclamped frame (min = MIN_DURATION) */
  const clientXToUnclamped = useCallback(
    (clientX: number) => {
      if (!rulerRef.current) return durationFrames;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = clientX - rect.left + scrollX;
      return Math.max(MIN_DURATION, Math.round(x / pxPerFrame));
    },
    [pxPerFrame, scrollX, durationFrames],
  );

  const handleEndBracketDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation(); // don't trigger ruler seek
      setIsDraggingEnd(true);
      // Capture duration at drag start for history
      durationAtDragStartRef.current = useTimelineStore.getState().config.durationFrames;
    },
    [],
  );

  const durationAtDragStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDraggingEnd) return;
    const handleMove = (e: MouseEvent) => {
      const newDuration = clientXToUnclamped(e.clientX);
      setDuration(newDuration);
    };
    const handleUp = () => {
      setIsDraggingEnd(false);
      // Record history for the duration change
      const oldDuration = durationAtDragStartRef.current;
      const newDuration = useTimelineStore.getState().config.durationFrames;
      if (oldDuration !== null && oldDuration !== newDuration) {
        const historyAction: TimelineDurationChangeHistoryAction = {
          type: 'timeline_duration_change',
          timestamp: Date.now(),
          description: `Change timeline duration from ${oldDuration} to ${newDuration} frames`,
          data: { oldDuration, newDuration },
        };
        pushToHistory(historyAction);
      }
      durationAtDragStartRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingEnd, clientXToUnclamped, setDuration, pushToHistory]);

  // Global mousemove / mouseup for drag-to-scrub
  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const frame = clientXToFrame(e.clientX);
      goToFrame(frame);
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, clientXToFrame, goToFrame]);

  // Determine tick interval — always show every frame
  const majorInterval = Math.max(1, frameRate);

  // PERF FIX: Compute visible tick range upfront instead of iterating all frames.
  // Previously iterated all durationFrames with a hardcoded 2000px cutoff.
  // Now computes exact start/end indices from scrollX and container width.
  const rulerWidth = rulerRef.current?.clientWidth ?? 1200;
  const TICK_MARGIN = 50; // px margin for smooth appearance
  const startTick = Math.max(0, Math.floor((scrollX - TICK_MARGIN) / pxPerFrame));
  const endTick = Math.min(durationFrames, Math.ceil((scrollX + rulerWidth + TICK_MARGIN) / pxPerFrame));

  const ticks: React.ReactNode[] = [];
  for (let i = startTick; i < endTick; i++) {
    const isMajor = i % majorInterval === 0;
    const left = i * pxPerFrame - scrollX;

    ticks.push(
      <div
        key={i}
        className="absolute top-0"
        style={{ left }}
      >
        <div
          className={cn(
            'border-l',
            isMajor ? 'h-2.5 border-foreground/40' : 'h-1.5 border-foreground/20',
          )}
        />
        {isMajor && (
          <span className="absolute top-2.5 -translate-x-1/2 text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
            {formatFrameLabel(i, frameRate)}
          </span>
        )}
      </div>,
    );
  }

  return (
    <div
      ref={rulerRef}
      className="relative h-6 flex-shrink-0 bg-muted/30 border-b border-border/50 cursor-pointer overflow-hidden select-none"
      onMouseDown={handleMouseDown}
    >
      {/* Ticks */}
      {ticks}

      {/* Playhead marker (static — stays at the frame where playback started) */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-10"
        style={{ left: currentFrame * pxPerFrame - scrollX }}
      >
        <div className="absolute -top-0.5 -left-[3px] w-2 h-2 bg-red-500 rounded-full" />
      </div>

      {/* Playback position indicator (moves during playback) */}
      {isPlaybackActive && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-400/70 pointer-events-none z-10"
          style={{ left: playbackFrame * pxPerFrame - scrollX }}
        >
          <div className="absolute -top-0.5 -left-[2px] w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] border-t-red-400" />
        </div>
      )}

      {/* End-of-timeline bracket — draggable to resize duration */}
      <div
        className={cn(
          'absolute top-0 bottom-0 z-20 cursor-col-resize group',
          isDraggingEnd && 'cursor-col-resize',
        )}
        style={{ left: durationFrames * pxPerFrame - scrollX - 3, width: 7 }}
        onMouseDown={handleEndBracketDown}
      >
        {/* Purple bracket line */}
        <div className="absolute left-[3px] top-0 bottom-0 w-[2px] bg-purple-500" />
        {/* Top cap */}
        <div className="absolute left-0 top-0 w-[7px] h-[3px] bg-purple-500 rounded-t-sm" />
        {/* Bottom cap */}
        <div className="absolute left-0 bottom-0 w-[7px] h-[3px] bg-purple-500 rounded-b-sm" />
        {/* Hover glow */}
        <div className="absolute left-[2px] top-0 bottom-0 w-[3px] bg-purple-400/0 group-hover:bg-purple-400/30 transition-colors" />
      </div>

      {/* Work area overlay — green range indicator along the bottom edge */}
      {workAreaEnabled && (() => {
        const waLeft = workAreaStart * pxPerFrame - scrollX;
        const waWidth = (workAreaEnd - workAreaStart) * pxPerFrame;
        const TICK_W = 6;
        const TICK_H = 6;

        const handleWorkAreaDrag = (e: React.MouseEvent, mode: 'start' | 'end' | 'body') => {
          e.stopPropagation();
          e.preventDefault();
          const startX = e.clientX;
          const origStart = workAreaStart;
          const origEnd = workAreaEnd;

          const onMove = (me: MouseEvent) => {
            const dx = me.clientX - startX;
            const frameDelta = Math.round(dx / pxPerFrame);
            if (mode === 'start') {
              setWorkAreaStart(origStart + frameDelta);
            } else if (mode === 'end') {
              setWorkAreaEnd(origEnd + frameDelta);
            } else {
              const duration = origEnd - origStart;
              const newStart = Math.max(0, origStart + frameDelta);
              const newEnd = Math.min(durationFrames, newStart + duration);
              useTimelineStore.getState().setWorkAreaStart(Math.max(0, newEnd - duration));
              useTimelineStore.getState().setWorkAreaEnd(newEnd);
            }
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        };

        return (
          <div className="absolute bottom-0 z-30" style={{ left: waLeft, width: waWidth, height: 6 }}>
            {/* Green bar */}
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-green-500/70 cursor-grab"
              onMouseDown={(e) => handleWorkAreaDrag(e, 'body')}
            />
            {/* Start tick */}
            <div
              className="absolute left-0 bottom-0 cursor-col-resize"
              style={{ width: TICK_W, height: TICK_H }}
              onMouseDown={(e) => handleWorkAreaDrag(e, 'start')}
            >
              <div className="absolute left-0 bottom-0 w-[2px] bg-green-500" style={{ height: TICK_H }} />
              <div className="absolute left-0 bottom-0 h-[2px] bg-green-500" style={{ width: TICK_W }} />
            </div>
            {/* End tick */}
            <div
              className="absolute right-0 bottom-0 cursor-col-resize"
              style={{ width: TICK_W, height: TICK_H }}
              onMouseDown={(e) => handleWorkAreaDrag(e, 'end')}
            >
              <div className="absolute right-0 bottom-0 w-[2px] bg-green-500" style={{ height: TICK_H }} />
              <div className="absolute right-0 bottom-0 h-[2px] bg-green-500" style={{ width: TICK_W }} />
            </div>
          </div>
        );
      })()}
    </div>
  );
};

/** @internal Exported for testing */
export function getTickInterval(zoom: number, frameRate: number): { minor: number; major: number } {
  if (zoom >= 3) return { minor: 1, major: frameRate };
  if (zoom >= 1.5) return { minor: 2, major: frameRate };
  if (zoom >= 0.8) return { minor: 5, major: frameRate };
  if (zoom >= 0.4) return { minor: frameRate, major: frameRate * 5 };
  return { minor: frameRate * 2, major: frameRate * 10 };
}

/** @internal Exported for testing */
export function formatFrameLabel(frame: number, frameRate: number): string {
  if (frame === 0) return '0';
  const seconds = frame / frameRate;
  if (seconds < 60) return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
