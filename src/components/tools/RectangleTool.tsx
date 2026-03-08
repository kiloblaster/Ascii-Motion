import React from 'react';
import { useBezierStore } from '../../stores/bezierStore';

/**
 * Rectangle Tool Component
 * The vector shape overlay handles all interaction.
 */
export const RectangleTool: React.FC = () => {
  return null;
};

/**
 * Rectangle Tool Status Component
 */
export const RectangleToolStatus: React.FC = () => {
  const { anchorPoints, affectedCellCount, fillMode } = useBezierStore();

  const getFillModeText = () => {
    switch (fillMode) {
      case 'constant': return 'Selection';
      case 'palette': return 'Palette';
      case 'autofill': return 'Autofill';
      case 'lineart': return 'Line Art';
      default: return 'Palette';
    }
  };

  if (anchorPoints.length === 0) {
    return (
      <span className="text-muted-foreground">
        Rectangle: {getFillModeText()} • Drag to draw, Shift for square
      </span>
    );
  }

  return (
    <span className="text-muted-foreground">
      Rectangle: {affectedCellCount} cell{affectedCellCount === 1 ? '' : 's'} • {getFillModeText()} • Enter to apply, Escape to cancel
    </span>
  );
};
