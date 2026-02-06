/**
 * Timecode Display — shows current playback position in various formats.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.12
 */

import React, { useState } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import type { TimecodeFormat } from '../../../types/timeline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';

/** Format a frame number into a display string. Exported for testing. */
export function formatTimecodeValue(
  frame: number,
  frameRate: number,
  format: TimecodeFormat,
): string {
  switch (format) {
    case 'frames':
      return `F${frame}`;
    case 'seconds':
      return `${(frame / frameRate).toFixed(2)}s`;
    case 'milliseconds':
      return `${Math.round((frame / frameRate) * 1000)}ms`;
    case 'timecode':
    default: {
      const totalSeconds = Math.floor(frame / frameRate);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const frames = frame % frameRate;
      return `${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    }
  }
}

export const TimecodeDisplay: React.FC = () => {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const [format, setFormat] = useState<TimecodeFormat>('timecode');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="font-mono text-xs text-muted-foreground hover:text-foreground tabular-nums px-1.5 py-0.5 rounded hover:bg-muted transition-colors">
          {formatTimecodeValue(currentFrame, frameRate, format)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setFormat('timecode')}>
          Timecode (MM:SS:FF)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setFormat('frames')}>Frames</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setFormat('seconds')}>Seconds</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setFormat('milliseconds')}>
          Milliseconds
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
