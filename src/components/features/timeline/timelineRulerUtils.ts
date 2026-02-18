/**
 * Timeline ruler utility functions — extracted from TimelineRuler.tsx
 * for react-refresh compatibility (only components may be exported from
 * files that contain React components).
 */

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
