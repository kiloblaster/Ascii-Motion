/**
 * usePostEffectsRenderer
 *
 * Manages the WebGL post-processing overlay canvas. Watches for Canvas2D
 * render completions and applies the post effect chain via WebGL.
 *
 * The overlay canvas sits directly on top of the main Canvas2D canvas.
 * It mirrors the main canvas's internal resolution AND CSS display size
 * (including high-DPI scaling) so they align pixel-perfectly.
 *
 * The hook subscribes to the same state that drives Canvas2D re-renders
 * (cells, grid, zoom, pan, background color, frame changes) and schedules
 * a post-processing pass via requestAnimationFrame so it runs after the
 * Canvas2D render.
 *
 * For optimized playback (which bypasses React), the module-level
 * `applyPlaybackPostEffects()` function is used directly in the playback
 * loop — see useOptimizedPlayback.ts.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useCanvasContext } from '../contexts/CanvasContext';
import { useCanvasStore } from '../stores/canvasStore';
import { useTimelineStore } from '../stores/timelineStore';
import { WebGLPostProcessor } from '../utils/webgl/WebGLPostProcessor';
import { buildPostEffectPasses, hasAnyPostEffects } from '../utils/postEffectsPipeline';
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
  const { canvasRef, zoom } = useCanvasContext();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const processorRef = useRef<WebGLPostProcessor | null>(null);
  // Stable callback ref — always points to the latest applyPostEffects
  // so a single rAF callback can always invoke the current version.
  const applyPostEffectsRef = useRef<(() => void) | null>(null);
  // Track rAF ID for cleanup on unmount only (not on state changes)
  const rafIdRef = useRef<number>(0);

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

  // Subscribe to canvas state that triggers Canvas2D re-renders.
  // When any of these change, the main canvas re-draws, and we need
  // to re-apply post effects to stay in sync.
  const canvasCells = useCanvasStore((s) => s.cells);
  const canvasWidth = useCanvasStore((s) => s.width);
  const canvasHeight = useCanvasStore((s) => s.height);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const canvasBgColor = useCanvasStore((s) => s.canvasBackgroundColor);

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

    // Initialize processor on the overlay canvas
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
   * This follows the same pattern as CanvasOverlay.tsx.
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

  // Keep the ref in sync with the latest applyPostEffects callback
  applyPostEffectsRef.current = applyPostEffects;

  // Re-apply post effects when ANY relevant state changes.
  // This mirrors the dependencies that trigger Canvas2D re-renders in
  // useCanvasRenderer, so the overlay always shows up-to-date output.
  //
  // NOTE: During optimized playback, this effect does NOT fire because
  // the playback loop bypasses React state updates. Instead, the playback
  // loop calls applyPlaybackPostEffects() directly (see below).
  useEffect(() => {
    if (!hasEffects) return;
    rafIdRef.current = requestAnimationFrame(() => {
      applyPostEffectsRef.current?.();
    });
  }, [
    hasEffects,
    // Canvas content changes
    canvasCells,
    canvasWidth,
    canvasHeight,
    showGrid,
    canvasBgColor,
    // Zoom/resize changes
    zoom,
    // Timeline changes
    currentFrame,
    postEffectTracks,
  ]);

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
