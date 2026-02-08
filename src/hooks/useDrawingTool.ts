import { useCallback } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useToolStore } from '../stores/toolStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useCanvasContext } from '../contexts/CanvasContext';
import { calculateBrushCells } from '../utils/brushUtils';
import { useSelectionStore } from '../stores/selectionStore';
import { isCellDrawableWithState, constrainCellsToSelectionWithState } from '../utils/selectionConstraint';
import { isLayerEditable, getTransformAtFrame, inverseTransformPoint } from '../utils/layerCompositing';
import { toast } from 'sonner';
import type { Cell } from '../types';

/**
 * Custom hook for handling canvas drawing operations
 */
export const useDrawingTool = () => {
  const { setCell, clearCell, getCell, fillArea } = useCanvasStore();
  const { 
    activeTool, 
    selectedChar, 
    selectedColor, 
    selectedBgColor,
    brushSettings,
    rectangleFilled,
    paintBucketContiguous,
    pickFromCell,
    pencilLastPosition,
    setPencilLastPosition,
    toolAffectsChar,
    toolAffectsColor,
    toolAffectsBgColor,
    fillMatchChar,
    fillMatchColor,
    fillMatchBgColor
  } = useToolStore();
  const { fontMetrics } = useCanvasContext();

  // Helper function to create a cell respecting the tool toggles
  const createCellWithToggles = useCallback((x: number, y: number): Cell => {
    const existingCell = getCell(x, y);
    const newChar = toolAffectsChar ? selectedChar : (existingCell?.char || ' ');
    
    // Only apply color data if the cell will have a character (not just a space)
    const willHaveChar = newChar !== ' ';
    const hasExistingChar = existingCell?.char && existingCell.char !== ' ';
    const shouldApplyColors = willHaveChar || hasExistingChar;
    
    return {
      char: newChar,
      color: (toolAffectsColor && shouldApplyColors) ? selectedColor : (existingCell?.color || '#FFFFFF'),
      bgColor: (toolAffectsBgColor && shouldApplyColors) ? selectedBgColor : (existingCell?.bgColor || 'transparent')
    };
  }, [toolAffectsChar, toolAffectsColor, toolAffectsBgColor, selectedChar, selectedColor, selectedBgColor, getCell]);

  // Helper function to create a cell with all attributes (for shape tools)
  const createCellWithAllAttributes = useCallback((): Cell => {
    return {
      char: selectedChar,
      color: selectedColor,
      bgColor: selectedBgColor
    };
  }, [selectedChar, selectedColor, selectedBgColor]);

  /**
   * Check if drawing is allowed on the active layer.
   * Returns false and shows a toast if the layer is locked.
   * Eyedropper tool is always allowed (read-only).
   */
  const checkActiveLayerEditable = useCallback((tool?: string): boolean => {
    const activeLayer = useTimelineStore.getState().layers.find(
      (l) => l.id === useTimelineStore.getState().view.activeLayerId
    );
    // If no layers loaded (v1 mode), allow drawing
    if (!activeLayer) return true;
    // Eyedropper is read-only, always allowed
    if (tool === 'eyedropper') return true;
    if (!isLayerEditable(activeLayer)) {
      if (activeLayer.locked) {
        toast.info('Layer is locked', { duration: 2000 });
      } else if (!activeLayer.visible) {
        toast.info('Layer is hidden', { duration: 2000 });
      }
      return false;
    }
    return true;
  }, []);

  // Bresenham line algorithm for drawing lines between two points
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

  // Draw a line between two points using the line algorithm
  const drawLine = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const rawPoints = getLinePoints(x0, y0, x1, y1);
    
    // Constrain line points to selection bounds (if selection is active)
    const { isActive, selectedCells } = useSelectionStore.getState();
    const points = constrainCellsToSelectionWithState(rawPoints, isActive, selectedCells);
    
    points.forEach(({ x, y }) => {
      const newCell = createCellWithToggles(x, y);
      setCell(x, y, newCell);
    });
  }, [getLinePoints, setCell, createCellWithToggles]);

  const applyBrushStroke = useCallback((toolKey: 'pencil' | 'eraser', centerX: number, centerY: number) => {
    const brush = brushSettings[toolKey];
    const rawBrushCells = calculateBrushCells(
      centerX,
      centerY,
      brush.size,
      brush.shape,
      fontMetrics.aspectRatio
    );
    
    // Constrain brush cells to selection bounds (if selection is active)
    const { isActive, selectedCells } = useSelectionStore.getState();
    const brushCells = constrainCellsToSelectionWithState(rawBrushCells, isActive, selectedCells);

    if (toolKey === 'eraser') {
      brushCells.forEach(({ x, y }) => {
        clearCell(x, y);
      });
    } else {
      brushCells.forEach(({ x, y }) => {
        const newCell = createCellWithToggles(x, y);
        setCell(x, y, newCell);
      });
    }
  }, [brushSettings, fontMetrics.aspectRatio, clearCell, createCellWithToggles, setCell]);

  const applyBrushLine = useCallback((toolKey: 'pencil' | 'eraser', x0: number, y0: number, x1: number, y1: number) => {
    const points = getLinePoints(x0, y0, x1, y1);
    points.forEach(({ x, y }) => {
      applyBrushStroke(toolKey, x, y);
    });
  }, [getLinePoints, applyBrushStroke]);

  const drawBrushLine = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    applyBrushLine('pencil', x0, y0, x1, y1);
  }, [applyBrushLine]);

  const eraseBrushLine = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    applyBrushLine('eraser', x0, y0, x1, y1);
  }, [applyBrushLine]);

  const drawAtPosition = useCallback((x: number, y: number, isShiftClick = false, toolOverride?: string) => {
    const toolToUse = toolOverride || activeTool;

    // Guard: check if active layer allows editing
    if (!checkActiveLayerEditable(toolToUse)) return;

    // Apply inverse layer transform so drawing lands at the visual cursor position.
    // The compositing renderer applies forward transforms when displaying, so we
    // need to undo that transform when writing to get visual alignment.
    const tl = useTimelineStore.getState();
    let lx = x, ly = y;
    if (tl.layers.length > 0 && tl.view.activeLayerId) {
      const layer = tl.layers.find((l) => l.id === tl.view.activeLayerId);
      if (layer) {
        const transform = getTransformAtFrame(layer, tl.view.currentFrame);
        if (transform.positionX !== 0 || transform.positionY !== 0 ||
            transform.scale !== 1 || transform.rotation !== 0 ||
            transform.anchorPointX !== 0 || transform.anchorPointY !== 0) {
          const local = inverseTransformPoint(x, y, transform);
          lx = local.x;
          ly = local.y;
        }
      }
    }

    switch (toolToUse) {
      case 'pencil': {
        const brushTool: 'pencil' | 'eraser' = 'pencil';
        if (isShiftClick && pencilLastPosition) {
          applyBrushLine(brushTool, pencilLastPosition.x, pencilLastPosition.y, lx, ly);
        } else {
          applyBrushStroke(brushTool, lx, ly);
        }
        
        // Update position for potential shift+click line drawing
        setPencilLastPosition({ x: lx, y: ly });
        break;
      }
      case 'eraser': {
        const brushTool: 'pencil' | 'eraser' = 'eraser';
        if (isShiftClick && pencilLastPosition) {
          applyBrushLine(brushTool, pencilLastPosition.x, pencilLastPosition.y, lx, ly);
        } else {
          applyBrushStroke(brushTool, lx, ly);
        }
        // Update last position for eraser too
        setPencilLastPosition({ x: lx, y: ly });
        break;
      }
      case 'eyedropper': {
        const existingCell = getCell(lx, ly);
        if (existingCell) {
          pickFromCell(existingCell.char, existingCell.color, existingCell.bgColor);
        }
        break;
      }
      case 'paintbucket': {
        const newCell = {
          char: selectedChar,
          color: selectedColor,
          bgColor: selectedBgColor
        };
        fillArea(
          lx, 
          ly, 
          newCell, 
          paintBucketContiguous, 
          { char: fillMatchChar, color: fillMatchColor, bgColor: fillMatchBgColor },
          { char: toolAffectsChar, color: toolAffectsColor, bgColor: toolAffectsBgColor }
        );
        break;
      }
    }
  }, [
    activeTool,
    paintBucketContiguous,
    getCell,
    fillArea,
    pickFromCell,
    pencilLastPosition,
    setPencilLastPosition,
    applyBrushStroke,
    applyBrushLine,
    fillMatchChar,
    fillMatchColor,
    fillMatchBgColor,
    selectedChar,
    selectedColor,
    selectedBgColor,
    toolAffectsChar,
    toolAffectsColor,
    toolAffectsBgColor,
    checkActiveLayerEditable
  ]);

  const drawRectangle = useCallback((startX: number, startY: number, endX: number, endY: number) => {
    // Guard: check if active layer allows editing
    if (!checkActiveLayerEditable()) return;

    // Inverse layer transform for both corners
    let sx = startX, sy = startY, ex = endX, ey = endY;
    const tl = useTimelineStore.getState();
    if (tl.layers.length > 0 && tl.view.activeLayerId) {
      const layer = tl.layers.find((l) => l.id === tl.view.activeLayerId);
      if (layer) {
        const transform = getTransformAtFrame(layer, tl.view.currentFrame);
        if (transform.positionX !== 0 || transform.positionY !== 0 || transform.scale !== 1 || transform.rotation !== 0 || transform.anchorPointX !== 0 || transform.anchorPointY !== 0) {
          const ls = inverseTransformPoint(startX, startY, transform);
          const le = inverseTransformPoint(endX, endY, transform);
          sx = ls.x; sy = ls.y; ex = le.x; ey = le.y;
        }
      }
    }

    const minX = Math.min(sx, ex);
    const maxX = Math.max(sx, ex);
    const minY = Math.min(sy, ey);
    const maxY = Math.max(sy, ey);
    
    // Get selection state once for efficiency
    const { isActive, selectedCells } = useSelectionStore.getState();

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // Check selection constraint
        if (!isCellDrawableWithState(x, y, isActive, selectedCells)) continue;
        
        // For hollow rectangles, only draw border
        if (!rectangleFilled) {
          if (x === minX || x === maxX || y === minY || y === maxY) {
            const newCell = createCellWithAllAttributes();
            setCell(x, y, newCell);
          }
        } else {
          // For filled rectangles, draw all cells
          const newCell = createCellWithAllAttributes();
          setCell(x, y, newCell);
        }
      }
    }
  }, [rectangleFilled, setCell, createCellWithAllAttributes, checkActiveLayerEditable]);

  // Helper function to get ellipse points using a simpler approach
  const getEllipsePoints = useCallback((centerX: number, centerY: number, radiusX: number, radiusY: number, filled: boolean = false) => {
    const points: Array<{ x: number; y: number }> = [];
    
    // Calculate bounding box
    const minX = Math.floor(centerX - radiusX);
    const maxX = Math.ceil(centerX + radiusX);
    const minY = Math.floor(centerY - radiusY);
    const maxY = Math.ceil(centerY + radiusY);
    
    if (filled) {
      // For filled ellipse, check each point within bounding box
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          // Check if point is inside ellipse using ellipse equation
          const dx = x - centerX;
          const dy = y - centerY;
          const distance = (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);
          
          if (distance <= 1) {
            points.push({ x: Math.round(x), y: Math.round(y) });
          }
        }
      }
    } else {
      // For hollow ellipse, use a simple approach: check points around the perimeter
      const numPoints = Math.max(Math.ceil(2 * Math.PI * Math.max(radiusX, radiusY)), 20);
      
      for (let i = 0; i < numPoints; i++) {
        const angle = (2 * Math.PI * i) / numPoints;
        const x = centerX + radiusX * Math.cos(angle);
        const y = centerY + radiusY * Math.sin(angle);
        
        points.push({ x: Math.round(x), y: Math.round(y) });
      }
      
      // Remove duplicates by using a Set
      const uniquePoints = Array.from(
        new Set(points.map(p => `${p.x},${p.y}`))
      ).map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
      });
      
      return uniquePoints;
    }
    
    return points;
  }, []);

  const drawEllipse = useCallback((startX: number, startY: number, endX: number, endY: number) => {
    // Guard: check if active layer allows editing
    if (!checkActiveLayerEditable()) return;

    // Inverse layer transform for both corners
    let sx = startX, sy = startY, ex = endX, ey = endY;
    const tl = useTimelineStore.getState();
    if (tl.layers.length > 0 && tl.view.activeLayerId) {
      const layer = tl.layers.find((l) => l.id === tl.view.activeLayerId);
      if (layer) {
        const transform = getTransformAtFrame(layer, tl.view.currentFrame);
        if (transform.positionX !== 0 || transform.positionY !== 0 || transform.scale !== 1 || transform.rotation !== 0 || transform.anchorPointX !== 0 || transform.anchorPointY !== 0) {
          const ls = inverseTransformPoint(startX, startY, transform);
          const le = inverseTransformPoint(endX, endY, transform);
          sx = ls.x; sy = ls.y; ex = le.x; ey = le.y;
        }
      }
    }

    const centerX = (sx + ex) / 2;
    const centerY = (sy + ey) / 2;
    const radiusX = Math.abs(ex - sx) / 2;
    const radiusY = Math.abs(ey - sy) / 2;

    const rawPoints = getEllipsePoints(centerX, centerY, radiusX, radiusY, rectangleFilled);
    
    // Constrain ellipse points to selection bounds (if selection is active)
    const { isActive, selectedCells } = useSelectionStore.getState();
    const points = constrainCellsToSelectionWithState(rawPoints, isActive, selectedCells);
    
    // Draw all the ellipse points
    points.forEach(({ x, y }) => {
      if (x >= 0 && y >= 0) { // Basic bounds checking
        const newCell = createCellWithAllAttributes();
        setCell(x, y, newCell);
      }
    });
  }, [rectangleFilled, setCell, getEllipsePoints, createCellWithAllAttributes, checkActiveLayerEditable]);

  return {
    drawAtPosition,
    drawRectangle,
    drawEllipse,
    drawLine, // Export for gap-filling in drag operations
    drawBrushLine, // Export for brush-aware gap-filling
    eraseBrushLine, // Export for eraser gap-filling
    getEllipsePoints, // Export for preview rendering
    getLinePoints, // Export for line preview rendering
    checkActiveLayerEditable, // Export for locked layer checks
    activeTool
  };
};
