/**
 * Vector Shape Geometry Utilities
 *
 * Generates BezierAnchorPoint arrays for rectangle and ellipse shapes,
 * allowing these shapes to reuse the bezier vector rendering pipeline.
 */

import type { BezierAnchorPoint } from '../stores/bezierStore';

let nextShapeAnchorId = 1;
function generateShapeAnchorId(): string {
  return `shape-anchor-${nextShapeAnchorId++}`;
}

/**
 * Cubic bezier approximation constant for quarter-circle arcs.
 * 4 cubic bezier segments using this kappa value produce a near-perfect circle.
 */
const KAPPA = 0.5522847498;

export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Generate BezierAnchorPoints for a rectangle.
 * When filled=true (default): 4 points, no handles, closed path.
 * When filled=false: 5 points (4 corners + closing duplicate), open path for stroke outline rendering.
 */
export function generateRectangleAnchorPoints(bounds: ShapeBounds, filled: boolean = true): BezierAnchorPoint[] {
  const { x, y, width, height } = bounds;
  const positions = [
    { x, y },                          // top-left
    { x: x + width, y },               // top-right
    { x: x + width, y: y + height },   // bottom-right
    { x, y: y + height },              // bottom-left
  ];

  const points: BezierAnchorPoint[] = positions.map((pos) => ({
    id: generateShapeAnchorId(),
    position: { ...pos },
    hasHandles: false,
    handleIn: null,
    handleOut: null,
    handleSymmetric: true,
    selected: false,
  }));

  // When not filled, add a closing point duplicating the first position
  // so the open path visually traces the full perimeter
  if (!filled) {
    points.push({
      id: generateShapeAnchorId(),
      position: { ...positions[0] },
      hasHandles: false,
      handleIn: null,
      handleOut: null,
      handleSymmetric: true,
      selected: false,
    });
  }

  return points;
}

/**
 * Generate BezierAnchorPoints for an ellipse using kappa-based cubic bezier handles.
 * When filled=true (default): 4 cardinal points, closed path.
 * When filled=false: 5 points (4 cardinal + closing duplicate), open path for stroke outline rendering.
 */
export function generateEllipseAnchorPoints(bounds: ShapeBounds, filled: boolean = true): BezierAnchorPoint[] {
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;

  const kx = rx * KAPPA;
  const ky = ry * KAPPA;

  // Top center, Right center, Bottom center, Left center (clockwise)
  const points: BezierAnchorPoint[] = [
    {
      id: generateShapeAnchorId(),
      position: { x: cx, y: cy - ry },       // top
      hasHandles: true,
      handleIn: { x: -kx, y: 0 },            // handle towards left
      handleOut: { x: kx, y: 0 },             // handle towards right
      handleSymmetric: true,
      selected: false,
    },
    {
      id: generateShapeAnchorId(),
      position: { x: cx + rx, y: cy },        // right
      hasHandles: true,
      handleIn: { x: 0, y: -ky },             // handle towards top
      handleOut: { x: 0, y: ky },              // handle towards bottom
      handleSymmetric: true,
      selected: false,
    },
    {
      id: generateShapeAnchorId(),
      position: { x: cx, y: cy + ry },        // bottom
      hasHandles: true,
      handleIn: { x: kx, y: 0 },              // handle towards right
      handleOut: { x: -kx, y: 0 },            // handle towards left
      handleSymmetric: true,
      selected: false,
    },
    {
      id: generateShapeAnchorId(),
      position: { x: cx - rx, y: cy },        // left
      hasHandles: true,
      handleIn: { x: 0, y: ky },              // handle towards bottom
      handleOut: { x: 0, y: -ky },            // handle towards top
      handleSymmetric: true,
      selected: false,
    },
  ];

  // When not filled, add a closing point duplicating the first (top) position
  if (!filled) {
    points.push({
      id: generateShapeAnchorId(),
      position: { x: cx, y: cy - ry },       // top (duplicate)
      hasHandles: true,
      handleIn: { x: -kx, y: 0 },            // same handles as first point
      handleOut: { x: kx, y: 0 },
      handleSymmetric: true,
      selected: false,
    });
  }

  return points;
}
