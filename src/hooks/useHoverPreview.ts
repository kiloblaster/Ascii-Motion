import { useEffect, useRef, useMemo } from 'react';
import { useToolStore } from '../stores/toolStore';
import { useCanvasContext } from '../contexts/CanvasContext';
import { calculateBrushCells } from '../utils/brushUtils';

/**
 * Hook for calculating and managing hover preview patterns for different tools
 * 
 * This hook monitors the current tool, tool settings, and cursor position to
 * automatically update the canvas hover preview overlay. The preview shows
 * which cells will be affected by the tool action before clicking.
 * 
 * Supported modes:
 * - 'brush': Shows brush pattern based on current size/shape (pencil tool)
 * - 'none': No preview (default for most tools)
 * 
 * Future extensibility:
 * - 'rectangle': Preview rectangle bounds before drawing
 * - 'ellipse': Preview ellipse shape before drawing
 * - 'line': Preview line path from start point to cursor
 * - 'paint-bucket': Preview fill area before applying
 */
export const useHoverPreview = () => {
  const { activeTool, brushSettings } = useToolStore();
  const { hoveredCellRef, fontMetrics, setHoverPreview, isDrawing, altKeyDown, ctrlKeyDown, registerHoveredCellRender } = useCanvasContext();
  
  // Calculate effective tool (Ctrl overrides pencil with eraser, Alt overrides drawing tools with eyedropper)
  const drawingTools = ['pencil', 'eraser', 'paintbucket', 'rectangle', 'ellipse'];
  const shouldAllowEyedropperOverride = drawingTools.includes(activeTool);
  let effectiveTool = activeTool;
  if (ctrlKeyDown && activeTool === 'pencil') {
    effectiveTool = 'eraser';
  } else if (altKeyDown && shouldAllowEyedropperOverride) {
    effectiveTool = 'eyedropper';
  }
  
  const activeBrush = effectiveTool === 'eraser' ? brushSettings.eraser : brushSettings.pencil;
  
  // Use refs to avoid effect re-runs on every hover cell change
  const rafIdRef = useRef<number | null>(null);
  const isScheduledRef = useRef(false);
  const effectiveToolRef = useRef(effectiveTool);
  const activeBrushRef = useRef(activeBrush);
  const isDrawingRef = useRef(isDrawing);
  
  // Keep refs in sync
  effectiveToolRef.current = effectiveTool;
  activeBrushRef.current = activeBrush;
  isDrawingRef.current = isDrawing;
  
  // Memoize brush pattern calculation - only recalculate when brush settings change
  const brushCellsCache = useRef<Map<string, { x: number; y: number }[]>>(new Map());
  
  const getBrushCells = useMemo(() => {
    return (x: number, y: number, size: number, shape: string, aspectRatio: number) => {
      const cacheKey = `${x},${y},${size},${shape},${aspectRatio}`;
      
      if (!brushCellsCache.current.has(cacheKey)) {
        // Limit cache size to prevent memory issues
        if (brushCellsCache.current.size > 100) {
          const firstKey = brushCellsCache.current.keys().next().value;
          if (firstKey) brushCellsCache.current.delete(firstKey);
        }
        
        const cells = calculateBrushCells(x, y, size, shape as 'square' | 'circle', aspectRatio);
        brushCellsCache.current.set(cacheKey, cells);
      }
      
      return brushCellsCache.current.get(cacheKey)!;
    };
  }, []);
  
  // Stable update function that doesn't cause effect re-runs
  const scheduleUpdate = useMemo(() => {
    return () => {
      // Only schedule one RAF at a time
      if (isScheduledRef.current) {
        return;
      }
      
      isScheduledRef.current = true;
      
      rafIdRef.current = requestAnimationFrame(() => {
        isScheduledRef.current = false;
        
        const currentHoveredCell = hoveredCellRef.current;
        const currentEffectiveTool = effectiveToolRef.current;
        const currentActiveBrush = activeBrushRef.current;
        const currentIsDrawing = isDrawingRef.current;
        
        // Don't show preview while actively drawing (except for eraser)
        if (currentIsDrawing && currentEffectiveTool !== 'eraser') {
          setHoverPreview({ active: false, mode: 'none', cells: [] });
          return;
        }
        
        // Clear preview when mouse leaves canvas
        if (!currentHoveredCell) {
          setHoverPreview({ active: false, mode: 'none', cells: [] });
          return;
        }
        
        // Calculate preview based on active tool
        switch (currentEffectiveTool) {
          case 'pencil':
          case 'eraser': {
            const brushCells = getBrushCells(
              currentHoveredCell.x,
              currentHoveredCell.y,
              currentActiveBrush.size,
              currentActiveBrush.shape,
              fontMetrics.aspectRatio
            );
            
            const mode = currentEffectiveTool === 'eraser' 
              ? (currentIsDrawing ? 'eraser-brush-active' : 'eraser-brush')
              : 'brush';
            
            setHoverPreview({
              active: true,
              mode,
              cells: brushCells
            });
            break;
          }
          
          default:
            setHoverPreview({ active: false, mode: 'none', cells: [] });
        }
      });
    };
  }, [fontMetrics.aspectRatio, setHoverPreview, getBrushCells]);
  
  // Register for direct notification when hoveredCell changes (bypasses React state)
  useEffect(() => {
    const cleanup = registerHoveredCellRender(() => scheduleUpdate());
    return cleanup;
  }, [registerHoveredCellRender, scheduleUpdate]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        isScheduledRef.current = false;
      }
    };
  }, []);
};
