import React, { useState, useEffect, useCallback } from 'react';
import { useCanvasContext } from '../../contexts/CanvasContext';

/**
 * MouseCoordinates Component
 * Displays current mouse position over canvas as [x, y] coordinates
 * Shows [-, -] when mouse is not hovering the canvas
 * 
 * Uses ref-based hoveredCell subscription to avoid triggering CanvasProvider
 * re-renders on every mouse move. Only THIS component re-renders when
 * the hovered cell changes.
 */
export const MouseCoordinates: React.FC = () => {
  const { hoveredCellRef, registerHoveredCellRender } = useCanvasContext();
  const [displayText, setDisplayText] = useState('[-, -]');

  const updateDisplay = useCallback(() => {
    const cell = hoveredCellRef.current;
    setDisplayText(cell ? `[${cell.x}, ${cell.y}]` : '[-, -]');
  }, [hoveredCellRef]);

  useEffect(() => {
    const cleanup = registerHoveredCellRender(updateDisplay);
    return cleanup;
  }, [registerHoveredCellRender, updateDisplay]);

  return (
    <span className="text-muted-foreground font-mono text-xs">
      {displayText}
    </span>
  );
};
