/**
 * useCompositedCanvas Hook
 * 
 * Provides composited cell data from all visible layers for rendering.
 * The active layer reads from canvasStore (the working copy), while all
 * other layers read from timelineStore (the source of truth).
 * 
 * This hook bridges the canvasStore (drawing) and timelineStore (layers)
 * for rendering purposes.
 * 
 * Part of the Layer Timeline Refactor (Phase 2)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §2.5
 */

import { useMemo } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useTimelineStore } from '../stores/timelineStore';
import type { Cell } from '../types';
import type { Layer } from '../types/timeline';
import {
  compositeLayersAtFrame,
  getContentFrameAtTime,
  getVisibleLayers,
} from '../utils/layerCompositing';

/**
 * Hook that provides composited cells from all layers for rendering.
 * 
 * Returns a getCellFunction that composites all visible layers at the current
 * frame, using canvasStore cells for the active layer (to reflect in-progress
 * drawing) and timelineStore cells for all other layers.
 * 
 * @returns Object with:
 *   - compositedCells: Map of all composited cells
 *   - getCompositedCell: Function to get a single cell at (x,y)
 *   - isLayerMode: Whether layers are active (vs legacy single-frame mode)
 *   - visibleLayerCount: Number of visible layers
 */
export function useCompositedCanvas() {
  const layers = useTimelineStore((s) => s.layers);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const canvasWidth = useCanvasStore((s) => s.width);
  const canvasHeight = useCanvasStore((s) => s.height);
  const canvasCells = useCanvasStore((s) => s.cells);

  // Determine if we're in layer mode (have layers loaded)
  const isLayerMode = layers.length > 0;

  // Composite all layers, but substitute canvasStore cells for the active layer
  const compositedCells = useMemo(() => {
    if (!isLayerMode) {
      // Not in layer mode — fall through to canvasStore directly
      return canvasCells;
    }

    // Fast path: single layer with NO transforms — skip compositing entirely
    // This handles the common case of editing with one layer and no keyframes
    if (layers.length === 1 && layers[0].id === activeLayerId) {
      const layer = layers[0];
      // Only fast-path if no property tracks and no VISUAL transform offsets.
      // Anchor point statics are excluded because they only affect rotation/scale
      // center — with no rotation or scale, anchor has zero visual effect.
      const hasTransforms = layer.propertyTracks.length > 0 ||
        Object.keys(layer.staticProperties).some(k => {
          // Skip anchor point — it doesn't affect position/scale/rotation visually
          if (k === 'transform.anchorPoint.x' || k === 'transform.anchorPoint.y') return false;
          const v = layer.staticProperties[k];
          if (k === 'transform.scale.x' || k === 'transform.scale.y') return v !== 1;
          return v !== 0;
        });
      
      if (!hasTransforms) {
        const activeContentFrame = getContentFrameAtTime(layer, currentFrame);
        if (activeContentFrame) {
          // Active layer uses canvasStore cells (the working copy)
          return canvasCells;
        }
        // Gap in content — empty canvas
        return new Map<string, Cell>();
      }
    }

    // Multi-layer path: build modified layers and composite
    const layersForCompositing: Layer[] = layers.map((layer) => {
      if (layer.id === activeLayerId) {
        // The active layer's content frame uses canvasStore cells (the working copy)
        // Find which content frame is active at the current frame
        const activeContentFrame = getContentFrameAtTime(layer, currentFrame);
        if (activeContentFrame) {
          return {
            ...layer,
            contentFrames: layer.contentFrames.map((cf) =>
              cf.id === activeContentFrame.id
                ? { ...cf, data: canvasCells }
                : cf,
            ),
          };
        }
      }
      return layer;
    });

    return compositeLayersAtFrame(
      layersForCompositing,
      currentFrame,
      canvasWidth,
      canvasHeight,
      undefined, // cellAspectRatio — use default
      false,     // clip: false — display mode shows all cells, including outside canvas bounds
    );
  }, [layers, currentFrame, activeLayerId, canvasCells, canvasWidth, canvasHeight, isLayerMode]);

  // Cell getter function for the renderer
  const getCompositedCell = useMemo(() => {
    return (x: number, y: number): Cell | undefined => {
      return compositedCells.get(`${x},${y}`);
    };
  }, [compositedCells]);

  const visibleLayerCount = useMemo(() => {
    return getVisibleLayers(layers).length;
  }, [layers]);

  return {
    compositedCells,
    getCompositedCell,
    isLayerMode,
    visibleLayerCount,
  };
}
