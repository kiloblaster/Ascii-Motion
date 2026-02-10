import { useCanvasContext } from './useCanvasContext';

export const useCanvasDimensions = () => {
  const { cellWidth, cellHeight, zoom, panOffset } = useCanvasContext();

  return {
    cellWidth,
    cellHeight,
    getCanvasSize: (gridWidth: number, gridHeight: number) => ({
      width: gridWidth * cellWidth,
      height: gridHeight * cellHeight,
    }),
    getGridCoordinates: (
      mouseX: number,
      mouseY: number,
      canvasRect: DOMRect,
      _gridWidth: number,
      _gridHeight: number,
    ) => {
      const relativeX = mouseX - canvasRect.left;
      const relativeY = mouseY - canvasRect.top;

      const adjustedX = relativeX - panOffset.x;
      const adjustedY = relativeY - panOffset.y;

      const effectiveCellWidth = cellWidth * zoom;
      const effectiveCellHeight = cellHeight * zoom;
      const x = Math.floor(adjustedX / effectiveCellWidth);
      const y = Math.floor(adjustedY / effectiveCellHeight);

      return {
        x,
        y,
      };
    },
    getGridCoordinatesWithCenter: (
      mouseX: number,
      mouseY: number,
      canvasRect: DOMRect,
      _gridWidth: number,
      _gridHeight: number,
    ) => {
      const relativeX = mouseX - canvasRect.left;
      const relativeY = mouseY - canvasRect.top;

      const adjustedX = relativeX - panOffset.x;
      const adjustedY = relativeY - panOffset.y;

      const effectiveCellWidth = cellWidth * zoom;
      const effectiveCellHeight = cellHeight * zoom;
      const x = Math.floor(adjustedX / effectiveCellWidth);
      const y = Math.floor(adjustedY / effectiveCellHeight);

      return {
        x: x + 0.5,
        y: y + 0.5,
      };
    },
  };
};
