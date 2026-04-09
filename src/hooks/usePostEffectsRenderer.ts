/**
 * usePostEffectsRenderer
 *
 * Manages the WebGL post-processing overlay canvas. Subscribes to canvas
 * render completion notifications so the post effect chain is re-applied
 * every time the main Canvas2D canvas redraws — regardless of what caused
 * the redraw (cell edits, background color, typography, classic effects,
 * zoom/pan, grid toggle, etc.).
 *
 * The overlay canvas sits directly on top of the main Canvas2D canvas.
 * It mirrors the main canvas's internal resolution AND CSS display size
 * (including high-DPI scaling) so they align pixel-perfectly.
 *
 * For optimized playback (which bypasses React), the module-level
 * `applyPlaybackPostEffects()` function is used directly in the playback
 * loop — see useOptimizedPlayback.ts.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useCanvasContext } from '../contexts/CanvasContext';
import { useTimelineStore } from '../stores/timelineStore';
import { WebGLPostProcessor } from '../utils/webgl/WebGLPostProcessor';
import { buildPostEffectPasses, hasAnyPostEffects } from '../utils/postEffectsPipeline';
import { onCanvasRendered } from '../utils/renderScheduler';
import type { PostEffectTrack } from '../types/postEffect';

// ============================================
// MODULE-LEVEL OVERLAY CANVAS REF
// ============================================
// Allows non-React code (e.g., the optimized playback loop) to access
// the overlay canvas without threading refs through React props.
let _overlayCanvas: HTMLCanvasElement | null = null;

/** Get the overlay canvas element for non-React use (e.g., playback loop). */
export function getOverlayCanvas(): HTMLCanvasElement | null {
  return _overlayCanvas;
}

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

  // Keep the module-level overlay ref in sync with the React ref.
  // This runs after every render, but it's just a pointer assignment.
  useEffect(() => {
    _overlayCanvas = overlayRef.current;
    return () => { _overlayCanvas = null; };
  });

  // Subscribe to post effect tracks and current frame
  const postEffectTracks = useTimelineStore((s) => s.postEffectTracks);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const frameRate = useTimelineStore((s) => s.config.frameRate);

  const hasEffects = hasAnyPostEffects(postEffectTracks);

  // Initialize / dispose WebGL processor when overlay canvas mounts/unmounts
  useEffect(() => {
    if (!hasEffects) {
      if (processorRef.current) {
        processorRef.current.dispose();
        processorRef.current = null;
      }
      return;
    }

    const overlayCanvas = overlayRef.current;
    if (!overlayCanvas) return;

    const processor = new WebGLPostProcessor();
    const ok = processor.initialize(overlayCanvas);
    if (!ok) {
      console.warn('[Post Effects] WebGL2 initialization failed');
      return;
    }

    processorRef.current = processor;

    return () => {
      processor.dispose();
      processorRef.current = null;
    };
  }, [hasEffects]);

  /**
   * Sync overlay canvas dimensions with the main canvas.
   * Copies both the internal resolution (canvas.width/height, which includes
   * devicePixelRatio scaling) and the CSS display size (style.width/height).
   *
   * Returns true if the canvas was resized (GL context was reset).
   */
  const syncOverlaySize = useCallback((): boolean => {
    const mainCanvas = canvasRef.current;
    const overlayCanvas = overlayRef.current;
    if (!mainCanvas || !overlayCanvas) return false;

    let resized = false;
    if (
      overlayCanvas.width !== mainCanvas.width ||
      overlayCanvas.height !== mainCanvas.height
    ) {
      overlayCanvas.width = mainCanvas.width;
      overlayCanvas.height = mainCanvas.height;
      resized = true;
    }
    // Always sync CSS display size
    overlayCanvas.style.width = mainCanvas.style.width;
    overlayCanvas.style.height = mainCanvas.style.height;
    return resized;
  }, [canvasRef]);

  // Apply post effects — reads from main Canvas2D, processes via WebGL,
  // writes to overlay canvas.
  const applyPostEffects = useCallback(() => {
    const sourceCanvas = canvasRef.current;
    const overlayCanvas = overlayRef.current;
    if (!sourceCanvas || !overlayCanvas) return;

    // Sync overlay size before rendering
    const resized = syncOverlaySize();

    // If the canvas was resized, the GL context was lost — re-initialize
    if (resized || !processorRef.current || !processorRef.current.isReady()) {
      if (processorRef.current) {
        processorRef.current.dispose();
      }
      const processor = new WebGLPostProcessor();
      const ok = processor.initialize(overlayCanvas);
      if (!ok) return;
      processorRef.current = processor;
    }

    const processor = processorRef.current;
    const time = currentFrame / (frameRate || 12);
    const passes = buildPostEffectPasses(postEffectTracks, currentFrame);

    processor.render(sourceCanvas, passes, time, currentFrame);
  }, [canvasRef, syncOverlaySize, postEffectTracks, currentFrame, frameRate]);

  // Keep the callback ref in sync so the listener always invokes the
  // latest version without re-subscribing.
  const applyRef = useRef(applyPostEffects);
  applyRef.current = applyPostEffects;

  // Subscribe to canvas render completions.
  // Fires after every main Canvas2D redraw — covers ALL state changes
  // (cells, bg color, typography, classic effects, zoom, grid, etc.)
  // without needing to mirror the renderer's dependency list.
  useEffect(() => {
    if (!hasEffects) return;

    // When the main canvas finishes rendering, schedule a post-effects
    // pass on the next animation frame so we read the freshly-drawn pixels.
    const unsubscribe = onCanvasRendered(() => {
      requestAnimationFrame(() => applyRef.current());
    });

    return unsubscribe;
  }, [hasEffects]);

  // Also re-apply when post effect tracks or current frame change
  // (these don't trigger a main canvas render, but change shader output).
  useEffect(() => {
    if (!hasEffects) return;
    requestAnimationFrame(() => applyRef.current());
  }, [hasEffects, postEffectTracks, currentFrame]);

  return {
    overlayRef,
    isActive: hasEffects,
    applyPostEffects,
  };
}

// ============================================
// PLAYBACK-FOCUSED UTILITY
// ============================================

/**
 * Apply post effects during optimized playback.
 *
 * The optimized playback loop bypasses React entirely, rendering directly
 * to the Canvas2D via renderFrameDirectly(). This function applies the
 * WebGL post effect chain to the overlay canvas, reading from the main
 * canvas that was just rendered by the playback loop.
 *
 * Uses a persistent WebGL processor to avoid per-frame initialization cost.
 *
 * @param sourceCanvas - The main Canvas2D canvas (just rendered by playback)
 * @param overlayCanvas - The WebGL overlay canvas
 * @param postEffectTracks - Current post effect tracks from the store
 * @param frame - Current timeline frame number
 * @param frameRate - Project frame rate
 */
let playbackProcessor: WebGLPostProcessor | null = null;

export function applyPlaybackPostEffects(
  sourceCanvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement,
  postEffectTracks: import('../types/postEffect').PostEffectTrack[],
  frame: number,
  frameRate: number,
): void {
  if (!hasAnyPostEffects(postEffectTracks)) return;

  const passes = buildPostEffectPasses(postEffectTracks, frame);
  if (passes.length === 0) return;

  // Sync overlay canvas dimensions with source
  if (
    overlayCanvas.width !== sourceCanvas.width ||
    overlayCanvas.height !== sourceCanvas.height
  ) {
    overlayCanvas.width = sourceCanvas.width;
    overlayCanvas.height = sourceCanvas.height;
    // Resize invalidates GL context — dispose old processor
    if (playbackProcessor) {
      playbackProcessor.dispose();
      playbackProcessor = null;
    }
  }
  overlayCanvas.style.width = sourceCanvas.style.width;
  overlayCanvas.style.height = sourceCanvas.style.height;

  // Initialize or re-initialize processor
  if (!playbackProcessor || !playbackProcessor.isReady()) {
    if (playbackProcessor) playbackProcessor.dispose();
    playbackProcessor = new WebGLPostProcessor();
    if (!playbackProcessor.initialize(overlayCanvas)) {
      playbackProcessor = null;
      return;
    }
  }

  const time = frame / (frameRate || 12);
  playbackProcessor.render(sourceCanvas, passes, time, frame);
}

/** Dispose the persistent playback processor (call when playback stops). */
export function disposePlaybackPostEffects(): void {
  if (playbackProcessor) {
    playbackProcessor.dispose();
    playbackProcessor = null;
  }
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

  // Create temporary processor with offscreen canvas at the same pixel resolution
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

    // Read back WebGL output onto the source canvas.
    // Use 'copy' composite mode to directly overwrite all pixel data including
    // the alpha channel. The default 'source-over' composites against the
    // destination alpha which can produce empty (transparent) PNGs when the
    // WebGL canvas has premultiplied-alpha edge cases.
    const ctx = sourceCanvas.getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.restore();
    }

    return true;
  } finally {
    processor.dispose();
  }
}
