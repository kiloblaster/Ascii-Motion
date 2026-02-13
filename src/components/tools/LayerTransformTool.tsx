/**
 * LayerTransformTool — Tool component + status for the Layer Transform tool.
 *
 * The behavior component is a no-op (all interaction is routed through
 * useCanvasMouseHandlers → useLayerTransformTool). The status component
 * shows the current drag mode and helpful instructions.
 *
 * Part of the Layer Timeline Refactor (Phase 4)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §4.10
 */

import React from 'react';
import { useToolStore } from '../../stores/toolStore';
import { useTimelineStore } from '../../stores/timelineStore';

/**
 * LayerTransformTool — Behavior component (renders nothing).
 * All logic is in useLayerTransformTool hook, invoked via LayerTransformOverlay.
 */
export const LayerTransformTool: React.FC = () => {
  return null;
};

/**
 * LayerTransformToolStatus — Status bar display showing current mode.
 * Uses lightweight store reads instead of useLayerTransformTool() to avoid
 * adding ~49 hooks to the CanvasGrid render path.
 */
export const LayerTransformToolStatus: React.FC = () => {
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const layers = useTimelineStore((s) => s.layers);
  const activeLayer = layers.find((l) => l.id === activeLayerId);

  if (!activeLayer) {
    return (
      <span className="text-muted-foreground">
        Layer Transform: No active layer
      </span>
    );
  }

  if (activeLayer.locked) {
    return (
      <span className="text-muted-foreground">
        Layer Transform: Layer is locked
      </span>
    );
  }

  return (
    <span className="text-purple-600">
      Layer Transform: Click inside to move, corners to scale, outside to rotate
    </span>
  );
};
