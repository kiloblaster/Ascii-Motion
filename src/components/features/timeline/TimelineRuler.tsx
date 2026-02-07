/**
 * Timeline Ruler — frame number ruler with click-to-seek and playhead.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.7
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { cn } from '@/lib/utils';

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
    },
    [],
  );

  useEffect(() => {
    if (!isDraggingEnd) return;
    const handleMove = (e: MouseEvent) => {
      const newDuration = clientXToUnclamped(e.clientX);
      setDuration(newDuration);
    };
    const handleUp = () => setIsDraggingEnd(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingEnd, clientXToUnclamped, setDuration]);

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

  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < durationFrames; i++) {
    const isMajor = i % majorInterval === 0;
    const left = i * pxPerFrame - scrollX;

    // Skip ticks outside visible area (with margin)
    if (left < -50 || left > 2000) continue;

    ticks.push(
      <div
        key={i}
        className="absolute top-0"
        style={{ left }}
      >
        <div
          className={cn(
            'border-l',
            isMajor ? 'h-4 border-foreground/40' : 'h-2 border-foreground/20',
          )}
        />
        {isMajor && (
          <span className="absolute top-3.5 -translate-x-1/2 text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
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

      {/* Playhead marker */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-10"
        style={{ left: currentFrame * pxPerFrame - scrollX }}
      >
        <div className="absolute -top-0.5 -left-[3px] w-2 h-2 bg-red-500 rounded-full" />
      </div>

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
