/**
 * Bezier Stroke Utilities
 * 
 * Generates tapered stroke shapes along bezier paths for open shapes.
 * Creates a polygon representing the stroke area which can then be filled
 * using the same autofill/palette fill logic as closed shapes.
 */

import type { BezierAnchorPoint } from '../stores/bezierStore';

/**
 * Point in 2D space
 */
interface Point {
  x: number;
  y: number;
}

/**
 * Calculate a point along a cubic bezier curve
 * @param t - Parameter from 0 to 1
 * @param p0 - Start point
 * @param cp1 - First control point
 * @param cp2 - Second control point
 * @param p1 - End point
 * @returns Point on the curve
 */
function cubicBezierPoint(
  t: number,
  p0: Point,
  cp1: Point,
  cp2: Point,
  p1: Point
): Point {
  const oneMinusT = 1 - t;
  const oneMinusT2 = oneMinusT * oneMinusT;
  const oneMinusT3 = oneMinusT2 * oneMinusT;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: oneMinusT3 * p0.x + 3 * oneMinusT2 * t * cp1.x + 3 * oneMinusT * t2 * cp2.x + t3 * p1.x,
    y: oneMinusT3 * p0.y + 3 * oneMinusT2 * t * cp1.y + 3 * oneMinusT * t2 * cp2.y + t3 * p1.y,
  };
}

/**
 * Calculate tangent (derivative) at point t on cubic bezier curve
 * @param t - Parameter from 0 to 1
 * @param p0 - Start point
 * @param cp1 - First control point
 * @param cp2 - Second control point
 * @param p1 - End point
 * @returns Tangent vector (not normalized)
 */
function cubicBezierTangent(
  t: number,
  p0: Point,
  cp1: Point,
  cp2: Point,
  p1: Point
): Point {
  const oneMinusT = 1 - t;
  const oneMinusT2 = oneMinusT * oneMinusT;
  const t2 = t * t;

  return {
    x: 3 * oneMinusT2 * (cp1.x - p0.x) + 6 * oneMinusT * t * (cp2.x - cp1.x) + 3 * t2 * (p1.x - cp2.x),
    y: 3 * oneMinusT2 * (cp1.y - p0.y) + 6 * oneMinusT * t * (cp2.y - cp1.y) + 3 * t2 * (p1.y - cp2.y),
  };
}

/**
 * Normalize a vector
 */
function normalize(v: Point): Point {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 1 }; // Default to up if zero length
  return { x: v.x / len, y: v.y / len };
}

/**
 * Get perpendicular vector (rotated 90 degrees counter-clockwise)
 */
function perpendicular(v: Point): Point {
  return { x: -v.y, y: v.x };
}

/**
 * Calculate width at a given position along the stroke
 * @param t - Position from 0 to 1 along the path
 * @param baseWidth - Base stroke width
 * @param taperStart - Taper amount at start (0 to 1)
 * @param taperEnd - Taper amount at end (0 to 1)
 * @returns Width at position t
 */
function calculateTaperedWidth(
  t: number,
  baseWidth: number,
  taperStart: number,
  taperEnd: number
): number {
  let width = baseWidth;
  
  // Apply start taper
  if (taperStart > 0 && t < taperStart) {
    // Linear taper from 0 to full width
    width *= (t / taperStart);
  }
  
  // Apply end taper
  if (taperEnd > 0 && t > (1 - taperEnd)) {
    // Linear taper from full width to 0
    const endT = (1 - t) / taperEnd;
    width *= endT;
  }
  
  return width;
}

/**
 * Generate stroke geometry for a bezier segment
 * @param p0 - Start point
 * @param cp1 - First control point
 * @param cp2 - Second control point
 * @param p1 - End point
 * @param baseWidth - Base stroke width
 * @param taperStart - Taper at start (0-1)
 * @param taperEnd - Taper at end (0-1)
 * @param segments - Number of segments to divide the curve into
 * @param tStart - Start t value (for path position calculation)
 * @param tEnd - End t value (for path position calculation)
 * @returns Left and right edge points
 */
function generateSegmentStroke(
  p0: Point,
  cp1: Point,
  cp2: Point,
  p1: Point,
  baseWidth: number,
  taperStart: number,
  taperEnd: number,
  segments: number,
  tStart: number,
  tEnd: number
): { left: Point[]; right: Point[] } {
  const leftPoints: Point[] = [];
  const rightPoints: Point[] = [];

  for (let i = 0; i <= segments; i++) {
    const tLocal = i / segments; // Local t along this segment
    const tGlobal = tStart + (tEnd - tStart) * tLocal; // Global t along entire path
    
    // Get point and tangent on curve
    const point = cubicBezierPoint(tLocal, p0, cp1, cp2, p1);
    let tangent = cubicBezierTangent(tLocal, p0, cp1, cp2, p1);
    
    // For degenerate cubics (straight lines where cp1=p0 and cp2=p1),
    // the tangent is zero at endpoints. Fall back to chord direction.
    const tangentLen = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
    if (tangentLen < 0.001) {
      tangent = { x: p1.x - p0.x, y: p1.y - p0.y };
    }
    
    // Get normal (perpendicular to tangent)
    const normal = perpendicular(normalize(tangent));
    
    // Calculate width at this position
    const width = calculateTaperedWidth(tGlobal, baseWidth, taperStart, taperEnd);
    const halfWidth = width / 2;
    
    // Calculate offset points on both sides
    leftPoints.push({
      x: point.x + normal.x * halfWidth,
      y: point.y + normal.y * halfWidth,
    });
    
    rightPoints.push({
      x: point.x - normal.x * halfWidth,
      y: point.y - normal.y * halfWidth,
    });
  }

  return { left: leftPoints, right: rightPoints };
}

/**
 * Compute a miter join point at a path junction.
 * Given two offset points on the same side of a corner, computes the
 * intersection point of the two offset lines (miter join).
 */
function computeMiterPoint(
  center: Point,
  offsetA: Point,
  offsetB: Point,
): Point {
  const dA = { x: offsetA.x - center.x, y: offsetA.y - center.y };
  const dB = { x: offsetB.x - center.x, y: offsetB.y - center.y };

  const lenA = Math.sqrt(dA.x * dA.x + dA.y * dA.y);
  const lenB = Math.sqrt(dB.x * dB.x + dB.y * dB.y);

  if (lenA < 0.001 || lenB < 0.001) {
    return { x: (offsetA.x + offsetB.x) / 2, y: (offsetA.y + offsetB.y) / 2 };
  }

  const avgLen = (lenA + lenB) / 2;
  const nA = { x: dA.x / lenA, y: dA.y / lenA };
  const nB = { x: dB.x / lenB, y: dB.y / lenB };

  // Compute bisector direction
  const bisect = { x: nA.x + nB.x, y: nA.y + nB.y };
  const bisectLen = Math.sqrt(bisect.x * bisect.x + bisect.y * bisect.y);

  if (bisectLen < 0.001) {
    // Offset directions are opposite (180° turn), use midpoint
    return { x: (offsetA.x + offsetB.x) / 2, y: (offsetA.y + offsetB.y) / 2 };
  }

  const nBisect = { x: bisect.x / bisectLen, y: bisect.y / bisectLen };
  const cosHalfAngle = nA.x * nBisect.x + nA.y * nBisect.y;

  // Limit miter for very sharp angles to avoid extreme spikes
  if (cosHalfAngle < 0.25) {
    return { x: (offsetA.x + offsetB.x) / 2, y: (offsetA.y + offsetB.y) / 2 };
  }

  const miterDist = avgLen / cosHalfAngle;

  return {
    x: center.x + nBisect.x * miterDist,
    y: center.y + nBisect.y * miterDist,
  };
}

/**
 * Generate stroke outline points for an entire bezier path
 * Creates a closed polygon representing the stroke area.
 * Uses miter joins at all segment junctions and handles virtually-closed
 * paths (where first and last anchor overlap) to avoid self-intersection.
 * 
 * @param anchorPoints - Bezier anchor points
 * @param strokeWidth - Base width of the stroke in grid units
 * @param taperStart - Taper amount at start (0 = no taper, 1 = full taper)
 * @param taperEnd - Taper amount at end (0 = no taper, 1 = full taper)
 * @param segmentsPerCurve - Number of segments to divide each curve into
 * @returns Array of points forming the stroke outline polygon
 */
export function generateStrokeOutline(
  anchorPoints: BezierAnchorPoint[],
  strokeWidth: number,
  taperStart: number,
  taperEnd: number,
  segmentsPerCurve: number = 20
): Point[] {
  if (anchorPoints.length < 2) {
    return [];
  }

  // Calculate total number of segments for global t calculation
  const totalSegments = anchorPoints.length - 1;

  // Generate stroke for each segment separately
  const segmentStrokes: { left: Point[]; right: Point[] }[] = [];

  for (let i = 0; i < totalSegments; i++) {
    const p0 = anchorPoints[i];
    const p1 = anchorPoints[i + 1];

    // Calculate global t range for this segment
    const tStart = i / totalSegments;
    const tEnd = (i + 1) / totalSegments;

    // Determine control points
    let cp1: Point, cp2: Point;

    if (p0.hasHandles && p0.handleOut) {
      cp1 = {
        x: p0.position.x + p0.handleOut.x,
        y: p0.position.y + p0.handleOut.y,
      };
    } else {
      cp1 = { x: p0.position.x, y: p0.position.y };
    }

    if (p1.hasHandles && p1.handleIn) {
      cp2 = {
        x: p1.position.x + p1.handleIn.x,
        y: p1.position.y + p1.handleIn.y,
      };
    } else {
      cp2 = { x: p1.position.x, y: p1.position.y };
    }

    const { left, right } = generateSegmentStroke(
      { x: p0.position.x, y: p0.position.y },
      cp1,
      cp2,
      { x: p1.position.x, y: p1.position.y },
      strokeWidth,
      taperStart,
      taperEnd,
      segmentsPerCurve,
      tStart,
      tEnd
    );

    segmentStrokes.push({ left, right });
  }

  // Check if path is virtually closed (first and last anchor at same position)
  const firstPos = anchorPoints[0].position;
  const lastPos = anchorPoints[anchorPoints.length - 1].position;
  const isVirtuallyClosed =
    Math.abs(firstPos.x - lastPos.x) < 0.001 &&
    Math.abs(firstPos.y - lastPos.y) < 0.001;

  // Build final arrays with miter joins at junctions
  const allLeftPoints: Point[] = [];
  const allRightPoints: Point[] = [];

  for (let i = 0; i < segmentStrokes.length; i++) {
    const { left, right } = segmentStrokes[i];

    if (i === 0) {
      allLeftPoints.push(...left);
      allRightPoints.push(...right);
    } else {
      // Compute miter join at junction between segment i-1 and segment i
      const junctionPos = anchorPoints[i].position;

      const prevLastLeft = allLeftPoints[allLeftPoints.length - 1];
      const currFirstLeft = left[0];
      const prevLastRight = allRightPoints[allRightPoints.length - 1];
      const currFirstRight = right[0];

      const leftMiter = computeMiterPoint(junctionPos, prevLastLeft, currFirstLeft);
      const rightMiter = computeMiterPoint(junctionPos, prevLastRight, currFirstRight);

      // Replace the last point of previous segment with miter
      allLeftPoints[allLeftPoints.length - 1] = leftMiter;
      allRightPoints[allRightPoints.length - 1] = rightMiter;

      // Skip first point of current segment (replaced by miter above)
      allLeftPoints.push(...left.slice(1));
      allRightPoints.push(...right.slice(1));
    }
  }

  // Handle virtually-closed path: miter join at start/end overlap
  if (isVirtuallyClosed && segmentStrokes.length >= 2) {
    const leftMiter = computeMiterPoint(
      { x: firstPos.x, y: firstPos.y },
      allLeftPoints[allLeftPoints.length - 1],
      allLeftPoints[0],
    );
    const rightMiter = computeMiterPoint(
      { x: firstPos.x, y: firstPos.y },
      allRightPoints[allRightPoints.length - 1],
      allRightPoints[0],
    );

    allLeftPoints[0] = leftMiter;
    allLeftPoints[allLeftPoints.length - 1] = leftMiter;
    allRightPoints[0] = rightMiter;
    allRightPoints[allRightPoints.length - 1] = rightMiter;
  }

  // Create closed polygon: left side forward, right side backward
  return [...allLeftPoints, ...allRightPoints.reverse()];
}

/**
 * Create a Path2D object from stroke outline points
 * @param outlinePoints - Polygon points defining the stroke
 * @param cellWidth - Width of a cell in pixels
 * @param cellHeight - Height of a cell in pixels
 * @param zoom - Current zoom level
 * @param panOffset - Pan offset in pixels
 * @returns Path2D object
 */
export function createStrokePath(
  outlinePoints: Point[],
  cellWidth: number,
  cellHeight: number,
  zoom: number,
  panOffset: { x: number; y: number }
): Path2D {
  const path = new Path2D();
  
  if (outlinePoints.length === 0) {
    return path;
  }

  const effectiveCellWidth = cellWidth * zoom;
  const effectiveCellHeight = cellHeight * zoom;

  // Move to first point
  const firstPoint = outlinePoints[0];
  path.moveTo(
    firstPoint.x * effectiveCellWidth + panOffset.x,
    firstPoint.y * effectiveCellHeight + panOffset.y
  );

  // Draw lines to all other points
  for (let i = 1; i < outlinePoints.length; i++) {
    const point = outlinePoints[i];
    path.lineTo(
      point.x * effectiveCellWidth + panOffset.x,
      point.y * effectiveCellHeight + panOffset.y
    );
  }

  // Close the path
  path.closePath();

  return path;
}

/**
 * Get bounding box for stroke outline
 * @param outlinePoints - Polygon points
 * @param canvasWidth - Canvas width in cells
 * @param canvasHeight - Canvas height in cells
 * @returns Bounds clamped to canvas
 */
export function getStrokeBounds(
  outlinePoints: Point[],
  canvasWidth: number,
  canvasHeight: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  if (outlinePoints.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of outlinePoints) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX: Math.max(0, Math.floor(minX)),
    maxX: Math.min(canvasWidth - 1, Math.ceil(maxX)),
    minY: Math.max(0, Math.floor(minY)),
    maxY: Math.min(canvasHeight - 1, Math.ceil(maxY)),
  };
}
