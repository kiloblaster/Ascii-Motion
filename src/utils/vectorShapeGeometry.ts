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
 * Generate 4 BezierAnchorPoints for a rectangle (no handles — straight edges).
 * Points are ordered: top-left, top-right, bottom-right, bottom-left (clockwise).
 */
export function generateRectangleAnchorPoints(bounds: ShapeBounds): BezierAnchorPoint[] {
  const { x, y, width, height } = bounds;
  const positions = [
    { x, y },                          // top-left
    { x: x + width, y },               // top-right
    { x: x + width, y: y + height },   // bottom-right
    { x, y: y + height },              // bottom-left
  ];

  return positions.map((pos) => ({
    id: generateShapeAnchorId(),
    position: { ...pos },
    hasHandles: false,
    handleIn: null,
    handleOut: null,
    handleSymmetric: true,
    selected: false,
  }));
}

/**
 * Generate 4 BezierAnchorPoints for an ellipse using kappa-based cubic bezier handles.
 * Points are at the cardinal positions: top, right, bottom, left (clockwise).
 * The handles approximate an ellipse to within ~0.027% error.
 */
export function generateEllipseAnchorPoints(bounds: ShapeBounds): BezierAnchorPoint[] {
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;

  const kx = rx * KAPPA;
  const ky = ry * KAPPA;

  // Top center, Right center, Bottom center, Left center (clockwise)
  return [
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
}
