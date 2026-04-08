import { useCallback, useRef, useEffect } from 'react';
import { useAnimationStore } from '../stores/animationStore';
import { useToolStore } from '../stores/toolStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useCanvasContext } from '../contexts/CanvasContext';
import { useCanvasState } from '../hooks/useCanvasState';
import { useTheme } from '../contexts/ThemeContext';
import { playbackOnlyStore } from '../stores/playbackOnlyStore';
import { renderFrameDirectly, type DirectRenderSettings } from '../utils/directCanvasRenderer';
import { compositeLayersAtFrame } from '../utils/layerCompositing';
import { applyPlaybackPostEffects, disposePlaybackPostEffects, getOverlayCanvas } from './usePostEffectsRenderer';
import { hasAnyPostEffects } from '../utils/postEffectsPipeline';
import type { Frame, FrameId } from '../types';

/**
 * Optimized playback hook that bypasses React component re-renders.
 *
 * In timeline / layer mode the playback loop composites all visible layers
 * at every timeline frame (0..durationFrames-1) and renders the result
 * directly to the canvas — no legacy Frame array involved.
 *
 * In legacy (single-layer / frame-view) mode it falls back to the original
 * behaviour of iterating through the adapter's Frame array.
 */
export const useOptimizedPlayback = () => {
  const animationRef = useRef<number | undefined>(undefined);
  const renderSettingsRef = useRef<DirectRenderSettings | null>(null);
  
  // Get all required React context data at hook level
  const frames = useAnimationStore((s) => s.frames);
  const canvasContext = useCanvasContext();
  const { canvasRef } = canvasContext;
  const canvasState = useCanvasState();
  const { theme } = useTheme();
  
  /**
   * Initialize render settings from current React context
   * This captures the current visual state before starting optimized playback
   */
  const initializeRenderSettings = useCallback((): DirectRenderSettings => {
    try {
      const settings: DirectRenderSettings = {
        effectiveCellWidth: canvasState.effectiveCellWidth,
        effectiveCellHeight: canvasState.effectiveCellHeight,
        panOffset: canvasContext.panOffset,
        fontMetrics: canvasContext.fontMetrics,
        zoom: canvasContext.zoom || 1,
        theme: theme as 'light' | 'dark',
        showGrid: true,
      };
      return settings;
    } catch {
      return {
        effectiveCellWidth: 18,
        effectiveCellHeight: 18,
        panOffset: { x: 0, y: 0 },
        fontMetrics: { fontSize: 16, fontFamily: 'SF Mono, Monaco, Consolas, monospace' },
        zoom: 1,
        theme: 'dark',
        showGrid: true,
      };
    }
  }, [canvasState, canvasContext, theme]);

  // ────────────────────────────────────────────
  // Stop
  // ────────────────────────────────────────────

  const stopOptimizedPlayback = useCallback((options?: { preserveFrameIndex?: boolean; frameIndex?: number }) => {
    const preserve = options?.preserveFrameIndex ?? true;
    const overrideIndex = options?.frameIndex;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }

    // Read current frame from timeline store (correctly updated during playback)
    // NOT from playbackOnlyStore which is bounded by synthetic frames in timeline mode
    const finalIndex = overrideIndex !== undefined
      ? overrideIndex
      : useTimelineStore.getState().view.currentFrame;

    playbackOnlyStore.stop();

    // Dispose the persistent WebGL processor used during playback
    disposePlaybackPostEffects();

    const { setPlaybackMode } = useToolStore.getState();
    setPlaybackMode(false);

    // Set isPlaying = false on BOTH stores so that all guards see the correct state.
    // The original animationStore is still imported everywhere, so it needs updating too.
    useTimelineStore.getState().setPlaying(false);
    useAnimationStore.setState({ isPlaying: false });

    if (preserve) {
      // Sync the timeline playhead to the final position
      useTimelineStore.getState().goToFrame(finalIndex);
    } else {
      useTimelineStore.getState().goToFrame(0);
    }

    renderSettingsRef.current = null;
  }, []);

  // ────────────────────────────────────────────
  // Start  — timeline-native compositing path
  // ────────────────────────────────────────────

  const startOptimizedPlayback = useCallback(() => {
    const tlState = useTimelineStore.getState();
    const { layers, config, view } = tlState;
    const { width: canvasWidth, height: canvasHeight } = useCanvasStore.getState();
    const durationFrames = config.durationFrames;
    const isLayerMode = layers.length > 0;

    // Need at least one frame (layer or legacy) to play
    if ((!isLayerMode && frames.length === 0) || !canvasRef?.current) {
      return;
    }

    // Work area bounds (if enabled)
    const waEnabled = view.workAreaEnabled;
    const waStart = waEnabled ? view.workAreaStart : 0;
    const waEnd = waEnabled ? view.workAreaEnd : durationFrames;

    // Starting frame — clamp to work area if enabled
    const startingFrame = isLayerMode
      ? Math.max(waStart, Math.min(view.currentFrame, waEnd - 1))
      : Math.max(0, Math.min(useAnimationStore.getState().currentFrameIndex, frames.length - 1));

    // Initialize render settings
    const renderSettings = initializeRenderSettings();
    renderSettingsRef.current = renderSettings;

    // Frame duration in ms (uniform for timeline mode)
    const frameDurationMs = 1000 / config.frameRate;

    // Build a synthetic legacy-style Frame array for the playbackOnlyStore.
    // In timeline mode, we need durationFrames entries so goToFrame() bounds-checking works.
    const syntheticFrames: Frame[] = isLayerMode
      ? Array.from({ length: durationFrames }, (_, i) => ({
          id: `synth-${i}` as unknown as FrameId,
          name: `Frame ${i}`,
          duration: frameDurationMs,
          data: new Map(),
        }))
      : frames;

    playbackOnlyStore.start(
      syntheticFrames,
      canvasRef as React.RefObject<HTMLCanvasElement>,
      0,
    );

    // Capture post effect state for the playback loop
    const postEffectTracks = tlState.postEffectTracks;
    const hasPostEffects = hasAnyPostEffects(postEffectTracks);

    // Set playback mode across the app
    const { setPlaybackMode } = useToolStore.getState();
    setPlaybackMode(true);
    // Set isPlaying on BOTH stores so all guards see the correct state
    useTimelineStore.getState().setPlaying(true);
    useAnimationStore.setState({ isPlaying: true });

    // Helper: render a pre-computed frame directly to canvas
    // Pre-compute ALL composited frames at playback start for smooth playback.
    // This eliminates per-frame compositing overhead entirely.
    let precomputedFrames: Map<string, import('../types').Cell>[] | null = null;

    if (isLayerMode) {
      const groups = useTimelineStore.getState().layerGroups;
      const globalEffectTracks = useTimelineStore.getState().globalEffects;
      precomputedFrames = [];
      for (let f = 0; f < durationFrames; f++) {
        precomputedFrames.push(
          compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight, undefined, true, groups, globalEffectTracks),
        );
      }
    }

    const renderPrecomputedFrame = (frame: number) => {
      const cells = precomputedFrames![frame];
      if (!cells) return;
      const syntheticFrame: Frame = {
        id: `frame-${frame}` as unknown as FrameId,
        name: `Frame ${frame}`,
        duration: frameDurationMs,
        data: cells,
      };
      renderFrameDirectly(
        syntheticFrame,
        canvasRef as React.RefObject<HTMLCanvasElement>,
        renderSettingsRef.current!,
      );
    };

    // Render the initial frame immediately
    if (isLayerMode) {
      renderPrecomputedFrame(startingFrame);
    } else {
      renderFrameDirectly(
        frames[startingFrame],
        canvasRef as React.RefObject<HTMLCanvasElement>,
        renderSettingsRef.current!,
      );
    }

    // Apply post effects to the initial frame
    if (hasPostEffects && canvasRef.current) {
      const overlay = getOverlayCanvas();
      if (overlay) {
        applyPlaybackPostEffects(
          canvasRef.current,
          overlay,
          postEffectTracks,
          startingFrame,
          config.frameRate,
        );
      }
    }

    // ── Playback loop ──
    let currentIndex = startingFrame;
    let lastFrameTime = performance.now();

    const playbackLoop = (timestamp: number) => {
      if (!playbackOnlyStore.isActive()) return;

      const elapsed = timestamp - lastFrameTime;

      if (isLayerMode) {
        // ── Timeline / layer mode (pre-computed) ──
        if (elapsed >= frameDurationMs) {
          const atLast = currentIndex >= waEnd - 1;
          if (atLast) {
            const { looping } = useTimelineStore.getState().view;
            if (looping) {
              currentIndex = waStart;
            } else {
              stopOptimizedPlayback({ preserveFrameIndex: true, frameIndex: currentIndex });
              return;
            }
          } else {
            currentIndex += 1;
          }

          // Track frame in playbackOnlyStore only (no React state updates)
          playbackOnlyStore.goToFrame(currentIndex);

          // Render the pre-computed composited frame directly to canvas
          renderPrecomputedFrame(currentIndex);

          // Apply post effects to the freshly-rendered Canvas2D
          if (hasPostEffects && canvasRef.current) {
            const overlay = getOverlayCanvas();
            if (overlay) {
              applyPlaybackPostEffects(
                canvasRef.current,
                overlay,
                postEffectTracks,
                currentIndex,
                config.frameRate,
              );
            }
          }

          // Fixed timestep: advance by intended duration, not actual elapsed.
          // This prevents cumulative timing drift from rAF overshoot.
          lastFrameTime += frameDurationMs;

          const { fpsMonitorCallback } = useAnimationStore.getState();
          if (fpsMonitorCallback) fpsMonitorCallback(timestamp);
        }
      } else {
        // ── Legacy frame mode ──
        const currentFrame = frames[currentIndex];
        if (!currentFrame) {
          stopOptimizedPlayback();
          return;
        }
        if (elapsed >= currentFrame.duration) {
          const atLast = currentIndex === frames.length - 1;
          if (atLast) {
            const { looping } = useAnimationStore.getState();
            if (looping) {
              currentIndex = 0;
            } else {
              stopOptimizedPlayback({ preserveFrameIndex: true, frameIndex: currentIndex });
              return;
            }
          } else {
            currentIndex += 1;
          }
          playbackOnlyStore.goToFrame(currentIndex);
          renderFrameDirectly(
            frames[currentIndex],
            canvasRef as React.RefObject<HTMLCanvasElement>,
            renderSettingsRef.current!,
          );

          // Apply post effects to the freshly-rendered Canvas2D
          if (hasPostEffects && canvasRef.current) {
            const overlay = getOverlayCanvas();
            if (overlay) {
              applyPlaybackPostEffects(
                canvasRef.current,
                overlay,
                postEffectTracks,
                currentIndex,
                config.frameRate,
              );
            }
          }

          // Fixed timestep: advance by intended duration, not actual elapsed.
          lastFrameTime += currentFrame.duration;
          const { fpsMonitorCallback } = useAnimationStore.getState();
          if (fpsMonitorCallback) fpsMonitorCallback(timestamp);
        }
      }

      animationRef.current = requestAnimationFrame(playbackLoop);
    };

    animationRef.current = requestAnimationFrame(playbackLoop);
  }, [frames, canvasRef, initializeRenderSettings, stopOptimizedPlayback]);

  /**
   * Toggle between optimized playback and normal React-based playback
   */
  const toggleOptimizedPlayback = useCallback(() => {
    if (playbackOnlyStore.isActive()) {
      stopOptimizedPlayback();
    } else {
      startOptimizedPlayback();
    }
  }, [startOptimizedPlayback, stopOptimizedPlayback]);

  /**
   * Check if optimized playback is currently active
   */
  const isOptimizedPlaybackActive = useCallback(() => {
    return playbackOnlyStore.isActive();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopOptimizedPlayback();
    };
  }, [stopOptimizedPlayback]);

  return {
    startOptimizedPlayback,
    stopOptimizedPlayback,
    toggleOptimizedPlayback,
    isOptimizedPlaybackActive,
    canPlay: frames.length > 0 || useTimelineStore.getState().layers.length > 0,
  };
};