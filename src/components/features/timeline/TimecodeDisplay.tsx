/**
 * Timecode Display — editable input showing current playhead position.
 *
 * Features:
 *  - Editable input field showing position in the selected timecode format
 *  - Live syncs with playhead position (mouse drag, hotkeys, playback)
 *  - Editing commits on Enter or blur, jumping the playhead to the entered value
 *  - Format label next to the input — clicking it opens the format chooser dropdown
 *  - Values clamped to timeline length, snapped to nearest whole frame
 *
 * Also exports TimelineDurationInput for the footer.
 *
 * Part of the Layer Timeline Refactor (Phase 3/4)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.12
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import type { TimecodeFormat } from '../../../types/timeline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { formatTimecodeValue, formatLabel, parseTimecodeInput } from './timecodeUtils';

// ============================================
// INTERNAL UTILS
// ============================================

/** Full name for dropdown. */
function formatName(format: TimecodeFormat): string {
  switch (format) {
    case 'frames':
      return 'Frames';
    case 'seconds':
      return 'Seconds';
    case 'milliseconds':
      return 'Milliseconds';
    case 'timecode':
    default:
      return 'Timecode (SS:FF)';
  }
}

// ============================================
// PLAYHEAD TIMECODE INPUT
// ============================================

export const TimecodeDisplay: React.FC = () => {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const format = useTimelineStore((s) => s.view.timecodeFormat);
  const setFormat = useTimelineStore((s) => s.setTimecodeFormat);
  const goToFrame = useTimelineStore((s) => s.goToFrame);

  const [editValue, setEditValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = formatTimecodeValue(currentFrame, frameRate, format);

  // Sync edit value when playhead moves (only when not actively editing)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(displayValue);
    }
  }, [displayValue, isEditing]);

  const commitValue = useCallback(() => {
    const parsed = parseTimecodeInput(editValue, frameRate, format);
    if (parsed !== null) {
      const clamped = Math.min(parsed, durationFrames - 1);
      goToFrame(clamped);
    }
    setIsEditing(false);
  }, [editValue, frameRate, format, durationFrames, goToFrame]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    setEditValue(displayValue);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [displayValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitValue();
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setEditValue(displayValue);
        inputRef.current?.blur();
      }
    },
    [commitValue, displayValue],
  );

  // Auto-size input based on displayed value length (ch = character width in monospace)
  const charCount = Math.max((isEditing ? editValue : displayValue).length, 3);

  return (
    <div className="flex items-center gap-0">
      <input
        ref={inputRef}
        type="text"
        value={isEditing ? editValue : displayValue}
        onChange={(e) => setEditValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
        style={{ width: `${charCount + 2}ch` }}
        className="font-mono text-xs text-muted-foreground tabular-nums px-1.5 -my-1 py-1 rounded bg-transparent border border-transparent hover:border-border focus:border-primary focus:text-foreground focus:bg-background outline-none text-center transition-colors"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-[10px] text-muted-foreground/60 hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors">
            {formatLabel(format)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(['timecode', 'frames', 'seconds', 'milliseconds'] as TimecodeFormat[]).map((f) => (
            <DropdownMenuItem key={f} onClick={() => setFormat(f)}>
              {formatName(f)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

// ============================================
// TIMELINE DURATION INPUT (for footer)
// ============================================

export const TimelineDurationInput: React.FC = () => {
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const format = useTimelineStore((s) => s.view.timecodeFormat);
  const setDuration = useTimelineStore((s) => s.setDuration);

  const [editValue, setEditValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = formatTimecodeValue(durationFrames, frameRate, format);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(displayValue);
    }
  }, [displayValue, isEditing]);

  const commitValue = useCallback(() => {
    const parsed = parseTimecodeInput(editValue, frameRate, format);
    if (parsed !== null && parsed >= 1) {
      setDuration(parsed);
    }
    setIsEditing(false);
  }, [editValue, frameRate, format, setDuration]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    setEditValue(displayValue);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [displayValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitValue();
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setEditValue(displayValue);
        inputRef.current?.blur();
      }
    },
    [commitValue, displayValue],
  );

  // Auto-size input based on displayed value length
  const footerCharCount = Math.max((isEditing ? editValue : displayValue).length, 3);

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground/60">Length:</span>
      <input
        ref={inputRef}
        type="text"
        value={isEditing ? editValue : displayValue}
        onChange={(e) => setEditValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
        style={{ width: `${footerCharCount + 2}ch` }}
        className="font-mono text-[10px] text-muted-foreground tabular-nums px-1 py-0.5 rounded bg-transparent border border-transparent hover:border-border focus:border-primary focus:text-foreground focus:bg-background outline-none text-center transition-colors"
      />
    </div>
  );
};
