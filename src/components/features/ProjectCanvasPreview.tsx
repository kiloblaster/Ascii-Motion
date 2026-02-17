/**
 * ASCII Motion - Project Canvas Preview
 * 
 * Renders a pixel-based preview of the first frame of a project
 * Similar to the timeline frame thumbnails but optimized for project cards
 * 
 * Supports both v1 (animation.frames) and v2 (layers/timeline) session formats.
 */

import { useMemo } from 'react';
import type { CloudProject } from '@ascii-motion/premium';

interface ProjectCanvasPreviewProps {
  project: CloudProject;
  height?: number;
}

/**
 * Extract cell data from the first frame of a project, regardless of format.
 * For v2: composites all visible layers at frame 0 (simple overlay, no transforms).
 * For v1: reads animation.frames[0].data directly.
 */
function getFirstFrameCells(
  sessionData: CloudProject['sessionData'],
): Record<string, { char: string; color: string; bgColor: string }> | null {
  if (!sessionData) return null;

  // v2 format: layers with content frames
  if (sessionData.version === '2.0.0' && Array.isArray(sessionData.layers)) {
    const composited: Record<string, { char: string; color: string; bgColor: string }> = {};
    // Composite layers bottom-to-top at frame 0 (simple overlay, no transforms)
    for (const layer of sessionData.layers as Array<{
      visible?: boolean;
      contentFrames?: Array<{
        startFrame?: number;
        durationFrames?: number;
        hidden?: boolean;
        data?: Record<string, { char: string; color: string; bgColor: string }>;
      }>;
    }>) {
      if (layer.visible === false) continue;
      for (const cf of layer.contentFrames ?? []) {
        if (cf.hidden) continue;
        // Frame 0 must be within this content frame's range
        const start = cf.startFrame ?? 0;
        const dur = cf.durationFrames ?? 1;
        if (0 >= start && 0 < start + dur && cf.data) {
          for (const [key, cell] of Object.entries(cf.data)) {
            if (cell.char && cell.char !== ' ') {
              composited[key] = cell;
            }
          }
        }
      }
    }
    return Object.keys(composited).length > 0 ? composited : null;
  }

  // v1 format: animation.frames
  const firstFrame = sessionData.animation?.frames?.[0];
  if (firstFrame?.data) {
    return firstFrame.data as Record<string, { char: string; color: string; bgColor: string }>;
  }

  return null;
}

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

/**
 * Generates a canvas preview of the project's first frame
 * Width is calculated based on canvas aspect ratio to maintain proportions
 */
export const ProjectCanvasPreview: React.FC<ProjectCanvasPreviewProps> = ({
  project,
  height = 120,
}) => {
  // Calculate width based on canvas aspect ratio
  const canvasWidth = project.sessionData?.canvas?.width ?? 80;
  const canvasHeight = project.sessionData?.canvas?.height ?? 24;
  const aspectRatio = canvasWidth / canvasHeight;
  const width = Math.round(height * aspectRatio);

  const previewDataUrl = useMemo(() => {
    // Safety check for sessionData
    if (!project.sessionData?.canvas) {
      return null;
    }

    // Get first frame cells (handles both v1 and v2 formats)
    const cellData = getFirstFrameCells(project.sessionData);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Set preview dimensions
    canvas.width = width;
    canvas.height = height;

    const canvasBgColor = project.sessionData.canvas.canvasBackgroundColor || '#1a1a1a';

    // Calculate scaling factors
    const scaleX = width / canvasWidth;
    const scaleY = height / canvasHeight;
    const cellWidthPx = Math.max(1, scaleX);
    const cellHeightPx = Math.max(1, scaleY);

    // Fill background
    ctx.fillStyle = canvasBgColor;
    ctx.fillRect(0, 0, width, height);

    if (!cellData) {
      // If no frame data, show a subtle grid pattern
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 0.5;
      const gridSpacing = 8;
      
      // Draw vertical lines
      for (let x = 0; x < width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      
      // Draw horizontal lines
      for (let y = 0; y < height; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      return canvas.toDataURL();
    }

    // Render each cell as a colored rectangle
    for (const [key, cell] of Object.entries(cellData)) {
      const coords = key.split(',').map(Number);
      const x = coords[0];
      const y = coords[1];

      if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
        // Calculate pixel position in preview
        const pixelX = Math.floor(x * scaleX);
        const pixelY = Math.floor(y * scaleY);

        // Use character color (foreground) primarily, fallback to background, then white
        const color = cell.color || cell.bgColor || '#ffffff';
        ctx.fillStyle = color;
        ctx.fillRect(pixelX, pixelY, Math.ceil(cellWidthPx), Math.ceil(cellHeightPx));
      }
    }

    return canvas.toDataURL();
  }, [project.sessionData, width, height, canvasWidth, canvasHeight]);

  if (!previewDataUrl) {
    return null;
  }

  return (
    <div className="w-full flex justify-center my-3">
      <img
        src={previewDataUrl}
        alt={`Preview of ${project.name}`}
        className="rounded border border-border/30"
        style={{ width, height }}
      />
    </div>
  );
};
