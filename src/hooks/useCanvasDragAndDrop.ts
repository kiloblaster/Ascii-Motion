import { useCallback } from 'react';
import { useCanvasContext, useCanvasDimensions } from '../contexts/CanvasContext';
import { useCanvasStore } from '../stores/canvasStore';
import { useAnimationStore } from '../stores/animationStore';
import { useToolStore } from '../stores/toolStore';
import { useDrawingTool } from './useDrawingTool';
import { calculateBrushCells } from '../utils/brushUtils';
import { screenToLocal } from '../utils/layerTransformUtils';

/**
 * Hook for handling drag and drop operations on the canvas
 * Used by drawing tools (pencil, eraser) and rectangle tool
 */
export const useCanvasDragAndDrop = () => {
  const { canvasRef, isDrawing, setIsDrawing, setMouseButtonDown, shiftKeyDown, cellWidth, cellHeight, fontMetrics } = useCanvasContext();
  const { getGridCoordinates } = useCanvasDimensions();
  const { width, height, cells } = useCanvasStore();
  const currentFrameIndex = useAnimationStore((s) => s.currentFrameIndex);
  const { 
    shapePreview,
    startShapePreview,
    updateShapePreview,
    clearShapePreview,
    pushCanvasHistory,
    finalizeCanvasHistory,
    pencilLastPosition,
    setLinePreview,
    clearLinePreview,
    getBrushSettings
  } = useToolStore();
  const { drawAtPosition, drawRectangle, drawEllipse, drawBrushLine, eraseBrushLine, activeTool } = useDrawingTool();

  // Helper function to apply aspect ratio constraints when shift is held
  const constrainToAspectRatio = useCallback((x: number, y: number, startX: number, startY: number) => {
    if (!shiftKeyDown) {
      return { x, y }; // No constraint when shift is not held
    }

    // Calculate deltas from start position (in grid cells)
    const deltaX = x - startX;
    const deltaY = y - startY;
    
    // To create a visually circular ellipse, we need to account for the cell aspect ratio
    // Typical monospace fonts have an aspect ratio of ~0.6 (width < height)
    // Convert grid deltas to visual (pixel-based) deltas
    const visualDeltaX = Math.abs(deltaX) * cellWidth;
    const visualDeltaY = Math.abs(deltaY) * cellHeight;
    
    // Use the larger visual delta to maintain a circular appearance
    const maxVisualDelta = Math.max(visualDeltaX, visualDeltaY);
    
    // Convert back to grid coordinates
    const constrainedGridDeltaX = maxVisualDelta / cellWidth;
    const constrainedGridDeltaY = maxVisualDelta / cellHeight;
    
    // Apply the constraint in the direction of the original movement
    const constrainedX = startX + (deltaX >= 0 ? constrainedGridDeltaX : -constrainedGridDeltaX);
    const constrainedY = startY + (deltaY >= 0 ? constrainedGridDeltaY : -constrainedGridDeltaY);
    
    return { x: constrainedX, y: constrainedY };
  }, [shiftKeyDown, cellWidth, cellHeight]);

  // Bresenham line algorithm for gap filling during drag operations
  const getLinePoints = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const points: { x: number; y: number }[] = [];
    
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    let x = x0;
    let y = y0;
    
    while (true) {
      points.push({ x, y });
      
      if (x === x1 && y === y1) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    
    return points;
  }, []);

  // Convert mouse coordinates to grid coordinates
  const getGridCoordinatesFromEvent = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    return getGridCoordinates(mouseX, mouseY, rect, width, height);
  }, [getGridCoordinates, width, height, canvasRef]);

  // Handle drawing operations
  const handleDrawing = useCallback((x: number, y: number, isShiftClick = false, toolOverride?: string) => {
    drawAtPosition(x, y, isShiftClick, toolOverride);
  }, [drawAtPosition]);

  // Handle drawing tool mouse down
  const handleDrawingMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>, toolOverride?: string) => {
    const { x, y } = getGridCoordinatesFromEvent(event);
    const isShiftClick = shiftKeyDown;
    
    // Save current state for undo
  pushCanvasHistory(new Map(cells), currentFrameIndex, 'Brush stroke');
    setMouseButtonDown(true);
    setIsDrawing(true);
    
    // Always treat mouse down as first stroke - this prevents connecting separate clicks
    // The gap-filling logic in mouse move will handle continuous drawing smoothness
  drawAtPosition(x, y, isShiftClick, toolOverride);
  }, [getGridCoordinatesFromEvent, cells, pushCanvasHistory, currentFrameIndex, setMouseButtonDown, setIsDrawing, drawAtPosition, shiftKeyDown]);

  // Handle drawing tool mouse move
  const handleDrawingMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>, toolOverride?: string) => {
    const { x, y } = getGridCoordinatesFromEvent(event);
    const tool = toolOverride || activeTool;
    
    if (isDrawing && (tool === 'pencil' || tool === 'eraser')) {
      // For drag operations, we want gap-filling to ensure smooth lines
      const { pencilLastPosition } = useToolStore.getState();
      
      if (pencilLastPosition && 
          (Math.abs(x - pencilLastPosition.x) > 1 || Math.abs(y - pencilLastPosition.y) > 1)) {
        // Large distance during drag - fill the gap with a line
        // Convert current position to local space to match pencilLastPosition
        // (which is stored in local space by drawAtPosition)
        const local = screenToLocal(x, y);
        if (tool === 'pencil') {
          drawBrushLine(pencilLastPosition.x, pencilLastPosition.y, local.x, local.y);
        } else if (tool === 'eraser') {
          eraseBrushLine(pencilLastPosition.x, pencilLastPosition.y, local.x, local.y);
        }
        
        // Update position after gap-filling (in local space)
        const { setPencilLastPosition } = useToolStore.getState();
        setPencilLastPosition({ x: local.x, y: local.y });
      } else {
        // Normal drag drawing - use regular drawing function
  handleDrawing(x, y, false, toolOverride); // Continuous stroke
      }
    }
    
    // Handle shift+click line preview for pencil tool
    if (!isDrawing && (tool === 'pencil' || tool === 'eraser') && shiftKeyDown) {
      if (pencilLastPosition) {
        // Get brush settings for current tool
        const brushSettings = getBrushSettings(tool === 'pencil' ? 'pencil' : 'eraser');
        
        // Generate base line from last position to current position using Bresenham
        const linePoints = getLinePoints(pencilLastPosition.x, pencilLastPosition.y, x, y);
        
        // For each point along the line, calculate all cells affected by the brush
        const allBrushCells = new Map<string, { x: number; y: number }>();
        
        linePoints.forEach(({ x: centerX, y: centerY }) => {
          const brushCells = calculateBrushCells(
            centerX,
            centerY,
            brushSettings.size,
            brushSettings.shape,
            fontMetrics.aspectRatio
          );
          
          // Add each brush cell to the set (using Map to avoid duplicates)
          brushCells.forEach(cell => {
            const key = `${cell.x},${cell.y}`;
            allBrushCells.set(key, cell);
          });
        });
        
        // Convert to array for the preview
        const previewPoints = Array.from(allBrushCells.values());
        setLinePreview(previewPoints);
      } else {
        // No last position yet - show brush pattern at current cell
        const brushSettings = getBrushSettings(tool === 'pencil' ? 'pencil' : 'eraser');
        const brushCells = calculateBrushCells(
          x,
          y,
          brushSettings.size,
          brushSettings.shape,
          fontMetrics.aspectRatio
        );
        setLinePreview(brushCells);
      }
    } else {
      // Clear preview when conditions not met
      clearLinePreview();
    }
  }, [getGridCoordinatesFromEvent, isDrawing, activeTool, shiftKeyDown, pencilLastPosition, handleDrawing, drawBrushLine, eraseBrushLine, getLinePoints, setLinePreview, clearLinePreview, getBrushSettings, fontMetrics.aspectRatio]);

  // Handle rectangle tool mouse down
  const handleRectangleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getGridCoordinatesFromEvent(event);
    
    // Save current state for undo
    pushCanvasHistory(new Map(cells), currentFrameIndex, 'Rectangle');
    
    // Start shape preview for rectangle bounds (NOT selection - keep existing selection intact)
    startShapePreview('rectangle', x, y);
    setMouseButtonDown(true);
  }, [getGridCoordinatesFromEvent, cells, pushCanvasHistory, currentFrameIndex, startShapePreview, setMouseButtonDown]);

  // Handle rectangle tool mouse move  
  const handleRectangleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getGridCoordinatesFromEvent(event);
    
    // Rectangle tool uses shape preview bounds (not selection)
    if (shapePreview.active && shapePreview.tool === 'rectangle') {
      // Apply aspect ratio constraint when shift is held (for perfect squares)
      const constrainedCoords = constrainToAspectRatio(x, y, shapePreview.start.x, shapePreview.start.y);
      updateShapePreview(constrainedCoords.x, constrainedCoords.y);
    }
  }, [getGridCoordinatesFromEvent, shapePreview.active, shapePreview.tool, shapePreview.start, updateShapePreview, constrainToAspectRatio]);

  // Handle rectangle tool mouse up
  const handleRectangleMouseUp = useCallback(() => {
    if (shapePreview.active && shapePreview.tool === 'rectangle') {
      // Draw rectangle (respects global selection mask) and clear shape preview
      drawRectangle(shapePreview.start.x, shapePreview.start.y, shapePreview.end.x, shapePreview.end.y);
      clearShapePreview();
    }
    setIsDrawing(false);
    setMouseButtonDown(false);
    // Finalize rectangle edit
    finalizeCanvasHistory(new Map(useCanvasStore.getState().cells));
  }, [shapePreview, drawRectangle, clearShapePreview, setIsDrawing, setMouseButtonDown, finalizeCanvasHistory]);

  // Handle ellipse tool mouse down (same as rectangle)
  const handleEllipseMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getGridCoordinatesFromEvent(event);
    
    // Save current state for undo
    pushCanvasHistory(new Map(cells), currentFrameIndex, 'Ellipse');
    
    // Start shape preview for ellipse bounds (NOT selection - keep existing selection intact)
    startShapePreview('ellipse', x, y);
    setMouseButtonDown(true);
  }, [getGridCoordinatesFromEvent, cells, pushCanvasHistory, currentFrameIndex, startShapePreview, setMouseButtonDown]);

  // Handle ellipse tool mouse move (same as rectangle with aspect ratio constraint)
  const handleEllipseMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getGridCoordinatesFromEvent(event);
    
    // Ellipse tool uses shape preview bounds (not selection)
    if (shapePreview.active && shapePreview.tool === 'ellipse') {
      // Apply aspect ratio constraint when shift is held (for perfect circles)
      const constrainedCoords = constrainToAspectRatio(x, y, shapePreview.start.x, shapePreview.start.y);
      updateShapePreview(constrainedCoords.x, constrainedCoords.y);
    }
  }, [getGridCoordinatesFromEvent, shapePreview.active, shapePreview.tool, shapePreview.start, updateShapePreview, constrainToAspectRatio]);

  // Handle ellipse tool mouse up
  const handleEllipseMouseUp = useCallback(() => {
    if (shapePreview.active && shapePreview.tool === 'ellipse') {
      // Draw ellipse (respects global selection mask) and clear shape preview
      drawEllipse(shapePreview.start.x, shapePreview.start.y, shapePreview.end.x, shapePreview.end.y);
      clearShapePreview();
    }
    setIsDrawing(false);
    setMouseButtonDown(false);
    // Finalize ellipse edit
    finalizeCanvasHistory(new Map(useCanvasStore.getState().cells));
  }, [shapePreview, drawEllipse, clearShapePreview, setIsDrawing, setMouseButtonDown, finalizeCanvasHistory]);

  return {
    // Drawing tools
    handleDrawingMouseDown,
    handleDrawingMouseMove,
    
    // Rectangle tool
    handleRectangleMouseDown,
    handleRectangleMouseMove,
    handleRectangleMouseUp,
    
    // Ellipse tool
    handleEllipseMouseDown,
    handleEllipseMouseMove,
    handleEllipseMouseUp,
    
    // Shared utilities
    getGridCoordinatesFromEvent,
    handleDrawing,
  };
};
