/**
 * Utility for applying inverse layer transforms to coordinates/cell maps.
 *
 * Used by drawing tools, text tool, bezier commit, gradient, etc.
 * to convert screen-space coordinates to layer-local coordinates
 * so that writes align with the composited visual feedback.
 *
 * Part of the Layer Timeline Refactor (Phase 4)
 */

import { useTimelineStore } from '../stores/timelineStore';
import {
  getTransformAtFrame,
  inverseTransformPoint,
  applyRotation,
} from './layerCompositing';
import type { Cell } from '../types';

/**
 * Get the active layer's inverse transform function.
 * Returns null if no transform is active (no-op case).
 */
function getActiveInverseTransform(): ((x: number, y: number) => { x: number; y: number }) | null {
  const tl = useTimelineStore.getState();
  if (tl.layers.length === 0 || !tl.view.activeLayerId) return null;

  const layer = tl.layers.find((l) => l.id === tl.view.activeLayerId);
  if (!layer) return null;

  const transform = getTransformAtFrame(layer, tl.view.currentFrame);
  const hasTransform =
    transform.positionX !== 0 ||
    transform.positionY !== 0 ||
    transform.scale !== 1 ||
    transform.rotation !== 0 ||
    transform.anchorPointX !== 0 ||
    transform.anchorPointY !== 0;

  if (!hasTransform) return null;

  return (sx: number, sy: number) => inverseTransformPoint(sx, sy, transform);
}

/**
 * Convert a single screen-space cell coordinate to layer-local space.
 * Returns the input unchanged if no layer transform is active.
 */
export function screenToLocal(x: number, y: number): { x: number; y: number } {
  const inv = getActiveInverseTransform();
  return inv ? inv(x, y) : { x, y };
}

/**
 * Transform a Map of cells keyed by "x,y" from screen-space to layer-local space.
 * Used by tools that bulk-write via setCanvasData (bezier, gradient, ascii type, etc.).
 *
 * Returns a new Map with re-keyed coordinates. Cell data is preserved.
 */
export function transformCellMapToLocal(cells: Map<string, Cell>): Map<string, Cell> {
  const inv = getActiveInverseTransform();
  if (!inv) return cells; // No transform — return original

  const result = new Map<string, Cell>();
  cells.forEach((cell, key) => {
    const [sx, sy] = key.split(',').map(Number);
    const local = inv(sx, sy);
    result.set(`${local.x},${local.y}`, cell);
  });
  return result;
}

/**
 * Forward-transform a single local-space coordinate to screen-space.
 * This is the same transform the compositing renderer applies.
 */
export function localToScreen(x: number, y: number): { x: number; y: number } {
  const tl = useTimelineStore.getState();
  if (tl.layers.length === 0 || !tl.view.activeLayerId) return { x, y };

  const layer = tl.layers.find((l) => l.id === tl.view.activeLayerId);
  if (!layer) return { x, y };

  const transform = getTransformAtFrame(layer, tl.view.currentFrame);
  const { positionX, positionY, scale, rotation, anchorPointX, anchorPointY } = transform;
  const hasTransform =
    positionX !== 0 || positionY !== 0 || scale !== 1 ||
    rotation !== 0 || anchorPointX !== 0 || anchorPointY !== 0;
  if (!hasTransform) return { x, y };

  const localX = x - anchorPointX;
  const localY = y - anchorPointY;
  const scaledX = localX * scale;
  const scaledY = localY * scale;
  const { rotatedX, rotatedY } = applyRotation(scaledX, scaledY, rotation);
  return {
    x: Math.round(rotatedX + anchorPointX + positionX),
    y: Math.round(rotatedY + anchorPointY + positionY),
  };
}

/**
 * Transform a Map of cells keyed by "x,y" from layer-local space to screen-space.
 * Used by preview renderers that need to display local-space data in composited view.
 */
export function transformCellMapToScreen(cells: Map<string, Cell>): Map<string, Cell> {
  const tl = useTimelineStore.getState();
  if (tl.layers.length === 0 || !tl.view.activeLayerId) return cells;

  const layer = tl.layers.find((l) => l.id === tl.view.activeLayerId);
  if (!layer) return cells;

  const transform = getTransformAtFrame(layer, tl.view.currentFrame);
  const hasTransform =
    transform.positionX !== 0 || transform.positionY !== 0 ||
    transform.scale !== 1 || transform.rotation !== 0 ||
    transform.anchorPointX !== 0 || transform.anchorPointY !== 0;
  if (!hasTransform) return cells;

  const result = new Map<string, Cell>();
  cells.forEach((cell, key) => {
    const [lx, ly] = key.split(',').map(Number);
    const screen = localToScreen(lx, ly);
    result.set(`${screen.x},${screen.y}`, cell);
  });
  return result;
}
