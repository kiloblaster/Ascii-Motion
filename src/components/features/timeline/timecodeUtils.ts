/**
 * Timecode format utility functions — extracted from TimecodeDisplay.tsx
 * for react-refresh compatibility (only components may be exported from
 * files that contain React components).
 */
import type { TimecodeFormat } from '../../../types/timeline';

/** Format a frame number into a display string. */
export function formatTimecodeValue(
  frame: number,
  frameRate: number,
  format: TimecodeFormat,
): string {
  switch (format) {
    case 'frames':
      return `${frame}`;
    case 'seconds':
      return `${(frame / frameRate).toFixed(2)}`;
    case 'milliseconds':
      return `${Math.round((frame / frameRate) * 1000)}`;
    case 'timecode':
    default: {
      const totalSeconds = Math.floor(frame / frameRate);
      const frames = frame % frameRate;
      return `${totalSeconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    }
  }
}

/** Full word label for each format (shown next to the input). */
export function formatLabel(format: TimecodeFormat): string {
  switch (format) {
    case 'frames':
      return 'Frames';
    case 'seconds':
      return 'Seconds';
    case 'milliseconds':
      return 'Milliseconds';
    case 'timecode':
    default:
      return 'Timecode';
  }
}

/**
 * Parse a user-entered timecode string into a frame number.
 * Returns the frame number, or null if the input is invalid.
 */
export function parseTimecodeInput(
  input: string,
  frameRate: number,
  format: TimecodeFormat,
): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  switch (format) {
    case 'frames': {
      const n = parseInt(trimmed, 10);
      return isNaN(n) ? null : Math.max(0, n);
    }
    case 'seconds': {
      const n = parseFloat(trimmed);
      return isNaN(n) ? null : Math.max(0, Math.round(n * frameRate));
    }
    case 'milliseconds': {
      const n = parseFloat(trimmed);
      return isNaN(n) ? null : Math.max(0, Math.round((n / 1000) * frameRate));
    }
    case 'timecode':
    default: {
      // Accept "SS:FF" or just a number (treated as seconds)
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const seconds = parseInt(parts[0], 10);
        const frames = parseInt(parts[1], 10);
        if (isNaN(seconds) || isNaN(frames)) return null;
        return Math.max(0, seconds * frameRate + frames);
      }
      const n = parseFloat(trimmed);
      return isNaN(n) ? null : Math.max(0, Math.round(n * frameRate));
    }
  }
}
