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
import { useLayerTransformTool } from '../../hooks/useLayerTransformTool';

/**
 * LayerTransformTool — Behavior component (renders nothing).
 * All logic is in useLayerTransformTool hook, invoked via useCanvasMouseHandlers.
 */
export const LayerTransformTool: React.FC = () => {
  return null;
};

/**
 * LayerTransformToolStatus — Status bar display showing current mode.
 */
export const LayerTransformToolStatus: React.FC = () => {
  const { dragState, isDisabled, isLocked, boundingBox, cursorZone } = useLayerTransformTool();

  if (isDisabled) {
    return (
      <span className="text-muted-foreground">
        Layer Transform: No active layer
      </span>
    );
  }

  if (isLocked) {
    return (
      <span className="text-muted-foreground">
        Layer Transform: Layer is locked
      </span>
    );
  }

  if (dragState) {
    const modeLabels: Record<string, string> = {
      move: 'Moving layer (Shift to constrain axis)',
      scale: 'Scaling layer',
      rotate: 'Rotating layer',
      anchor: 'Moving anchor point (Pan Behind)',
    };
    return (
      <span className="text-purple-500">
        {modeLabels[dragState.mode] ?? 'Transforming...'}
      </span>
    );
  }

  const hintLabels: Record<string, string> = {
    move: 'Drag to move',
    scale: 'Drag corner to scale',
    rotate: 'Drag to rotate',
    anchor: 'Drag anchor point',
    none: boundingBox ? 'Click inside box to move, corner to scale, outside to rotate' : 'Only anchor point available (no content)',
  };

  return (
    <span className="text-purple-500">
      Layer Transform: {hintLabels[cursorZone] ?? hintLabels.none}
    </span>
  );
};
