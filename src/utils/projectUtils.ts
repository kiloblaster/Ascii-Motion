/**
 * Project utility functions — extracted from ProjectCanvasPreview.tsx
 * for react-refresh compatibility (only components may be exported from
 * files that contain React components).
 */
import type { CloudProject } from '@ascii-motion/premium';

/**
 * Count total content frames in a project, regardless of format.
 */
export function getProjectFrameCount(sessionData: CloudProject['sessionData']): number {
  if (!sessionData) return 0;

  // v2 format
  if (sessionData.version === '2.0.0' && Array.isArray(sessionData.layers)) {
    let count = 0;
    for (const layer of sessionData.layers as Array<{ contentFrames?: unknown[] }>) {
      count += Array.isArray(layer.contentFrames) ? layer.contentFrames.length : 0;
    }
    return count;
  }

  // v1 format
  return sessionData.animation?.frames?.length ?? 0;
}
