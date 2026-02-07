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

export const TimelineRuler: React.FC = () => {
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const zoom = useTimelineStore((s) => s.view.zoom);
  const scrollX = useTimelineStore((s) => s.view.scrollX);
  const goToFrame = useTimelineStore((s) => s.goToFrame);

  const rulerRef = useRef<HTMLDivElement>(null);
  const pxPerFrame = BASE_PX_PER_FRAME * zoom;
  const totalWidth = durationFrames * pxPerFrame;
  const [isDragging, setIsDragging] = useState(false);

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

  // Determine tick interval based on zoom
  const tickInterval = getTickInterval(zoom, frameRate);

  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < durationFrames; i += tickInterval.minor) {
    const isMajor = i % tickInterval.major === 0;
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
            'border-l border-border/50',
            isMajor ? 'h-3' : 'h-1.5',
          )}
        />
        {isMajor && (
          <span className="absolute top-3 -translate-x-1/2 text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
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
