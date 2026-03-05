import React from 'react';
import { useBezierStore } from '../../stores/bezierStore';

/**
 * Ellipse Tool Component
 * The vector shape overlay handles all interaction.
 */
export const EllipseTool: React.FC = () => {
  return null;
};

/**
 * Ellipse Tool Status Component
 */
export const EllipseToolStatus: React.FC = () => {
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
        Ellipse: {getFillModeText()} • Drag to draw, Shift for circle
      </span>
    );
  }

  return (
    <span className="text-muted-foreground">
      Ellipse: {affectedCellCount} cell{affectedCellCount === 1 ? '' : 's'} • {getFillModeText()} • Enter to apply, Escape to cancel
    </span>
  );
};
