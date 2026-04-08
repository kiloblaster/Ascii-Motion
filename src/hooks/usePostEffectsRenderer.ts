/**
 * usePostEffectsRenderer
 *
 * Manages the WebGL post-processing overlay canvas. Watches for Canvas2D
 * render completions and applies the post effect chain via WebGL.
 *
 * The overlay canvas sits directly on top of the main Canvas2D canvas.
 * When post effects are active, the overlay is visible (showing the
 * processed output) and the main canvas is hidden. When there are no
 * post effects, the overlay is hidden and the main canvas is shown
 * directly, avoiding any GPU overhead.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useCanvasContext } from '../contexts/CanvasContext';
import { useTimelineStore } from '../stores/timelineStore';
import { WebGLPostProcessor } from '../utils/webgl/WebGLPostProcessor';
import { buildPostEffectPasses, hasAnyPostEffects } from '../utils/postEffectsPipeline';
import type { PostEffectTrack } from '../types/postEffect';

// ============================================
// HOOK
// ============================================

export function usePostEffectsRenderer(): {
  /** The overlay canvas ref — mount this element on top of the main canvas */
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  /** Whether the overlay canvas should be displayed (post effects exist) */
  isActive: boolean;
  /** Trigger a post-effect render pass for the current frame */
  applyPostEffects: () => void;
} {
  const { canvasRef } = useCanvasContext();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const processorRef = useRef<WebGLPostProcessor | null>(null);
  const isActiveRef = useRef(false);

  // Subscribe to post effect tracks and current frame
  const postEffectTracks = useTimelineStore((s) => s.postEffectTracks);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const frameRate = useTimelineStore((s) => s.config.frameRate);

  const hasEffects = hasAnyPostEffects(postEffectTracks);

  // Initialize / dispose WebGL processor when overlay canvas mounts/unmounts
  useEffect(() => {
    if (!hasEffects) {
      // No post effects — dispose processor
      if (processorRef.current) {
        processorRef.current.dispose();
        processorRef.current = null;
      }
      isActiveRef.current = false;
      return;
    }

    const overlayCanvas = overlayRef.current;
    if (!overlayCanvas) return;

    // Initialize processor on the overlay canvas
    const processor = new WebGLPostProcessor();
    const ok = processor.initialize(overlayCanvas);
    if (!ok) {
      console.warn('[Post Effects] WebGL2 initialization failed — post effects disabled');
      isActiveRef.current = false;
      return;
    }

    processorRef.current = processor;
    isActiveRef.current = true;

    return () => {
      processor.dispose();
      processorRef.current = null;
      isActiveRef.current = false;
    };
  }, [hasEffects]);

  // Apply post effects whenever the frame or tracks change
  const applyPostEffects = useCallback(() => {
    const processor = processorRef.current;
    const sourceCanvas = canvasRef.current;
    const overlayCanvas = overlayRef.current;
    if (!processor || !processor.isReady() || !sourceCanvas || !overlayCanvas) return;

    const time = currentFrame / (frameRate || 12);
    const passes = buildPostEffectPasses(postEffectTracks, currentFrame);

    processor.render(sourceCanvas, passes, time, currentFrame);
  }, [canvasRef, postEffectTracks, currentFrame, frameRate]);

  // Auto-apply when frame or tracks change
  useEffect(() => {
    if (!hasEffects) return;
    // Small delay to ensure Canvas2D has finished rendering
    const raf = requestAnimationFrame(() => {
      applyPostEffects();
    });
    return () => cancelAnimationFrame(raf);
  }, [hasEffects, applyPostEffects]);

  return {
    overlayRef,
    isActive: hasEffects,
    applyPostEffects,
  };
}

// ============================================
// EXPORT-FOCUSED UTILITY
// ============================================

/**
 * Apply post effects to a canvas for export purposes (non-React context).
 * Creates a temporary WebGL processor, applies effects, then reads back
 * the result onto the source canvas.
 *
 * @param sourceCanvas - The Canvas2D-rendered frame
 * @param postEffectTracks - Post effect tracks to apply
 * @param frame - Current frame number
 * @param frameRate - Frames per second
 * @returns true if post effects were applied, false otherwise
 */
export function applyPostEffectsToCanvas(
  sourceCanvas: HTMLCanvasElement,
  postEffectTracks: PostEffectTrack[],
  frame: number,
  frameRate: number,
): boolean {
  if (!hasAnyPostEffects(postEffectTracks)) return false;

  const passes = buildPostEffectPasses(postEffectTracks, frame);
  if (passes.length === 0) return false;

  // Create temporary processor with offscreen canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sourceCanvas.width;
  tempCanvas.height = sourceCanvas.height;

  const processor = new WebGLPostProcessor();
  const ok = processor.initialize(tempCanvas);
  if (!ok) {
    console.warn('[Post Effects Export] WebGL2 not available — skipping post effects');
    return false;
  }

  try {
    const time = frame / (frameRate || 12);
    processor.render(sourceCanvas, passes, time, frame);

    // Read back WebGL output onto the source canvas
    const ctx = sourceCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      ctx.drawImage(tempCanvas, 0, 0);
    }

    return true;
  } finally {
    processor.dispose();
  }
}
