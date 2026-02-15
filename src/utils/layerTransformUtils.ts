/**
 * Utility for applying inverse layer transforms to coordinates/cell maps.
 *
 * Used by drawing tools, text tool, bezier commit, gradient, etc.
 * to convert screen-space coordinates to layer-local coordinates
 * so that writes align with the composited visual feedback.
 *
 * Composes group transforms when the active layer belongs to a group.
 * The composition order matches compositeLayersAtFrame():
 *   - position: additive (layer + group)
 *   - scale: multiplicative (layer × group)
 *   - rotation: additive (layer + group)
 *
 * Part of the Layer Timeline Refactor (Phase 4 + Phase 7 group support)
 */

import { useTimelineStore } from '../stores/timelineStore';
import {
  getTransformAtFrame,
  getGroupPropertyValue,
  inverseTransformPoint,
  applyRotation,
} from './layerCompositing';
import type { Cell } from '../types';
import type { Layer, LayerGroup } from '../types/timeline';

// ========================================================================
// Transform interface (matches compositing engine)
// ========================================================================

interface ComposedTransform {
  positionX: number;
  positionY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorPointX: number;
  anchorPointY: number;
}

// ========================================================================
// Internal: compute the composed transform for a layer + its group
// ========================================================================

/**
 * Compute the composed transform for any layer, including parent group
 * transforms if the layer belongs to a group.
 *
 * Used internally by screenToLocal/localToScreen (for active layer) and
 * exported for multi-layer operations that need per-layer transforms.
 */
export function getComposedTransformForLayer(
  layer: Layer,
  frame: number,
  groups: LayerGroup[],
): ComposedTransform {
  const layerTransform = getTransformAtFrame(layer, frame);

  let posX = layerTransform.positionX;
  let posY = layerTransform.positionY;
  let scaleX = layerTransform.scaleX;
  let scaleY = layerTransform.scaleY;
  let rotation = layerTransform.rotation;
  const anchorX = layerTransform.anchorPointX;
  const anchorY = layerTransform.anchorPointY;

  // Compose group transforms if this layer belongs to a group
  if (layer.parentGroupId) {
    const group = groups.find((g) => g.id === layer.parentGroupId);
    if (group) {
      posX += getGroupPropertyValue(group, 'transform.position.x', frame);
      posY += getGroupPropertyValue(group, 'transform.position.y', frame);
      scaleX *= getGroupPropertyValue(group, 'transform.scale.x', frame);
      scaleY *= getGroupPropertyValue(group, 'transform.scale.y', frame);
      rotation += getGroupPropertyValue(group, 'transform.rotation', frame);
    }
  }

  return { positionX: posX, positionY: posY, scaleX, scaleY, rotation, anchorPointX: anchorX, anchorPointY: anchorY };
}

/**
 * Compute composed transform for a specific layer by ID.
 * Convenience wrapper that reads from the timeline store.
 */
export function screenToLocalForLayer(
  layerId: string,
  x: number,
  y: number,
): { x: number; y: number } {
  const tl = useTimelineStore.getState();
  const layer = tl.layers.find((l) => l.id === layerId);
  if (!layer) return { x, y };

  const transform = getComposedTransformForLayer(layer, tl.view.currentFrame, tl.layerGroups);
  if (!hasNonIdentityTransform(transform)) return { x, y };
  return inverseTransformPoint(x, y, transform);
}

// ========================================================================
// Internal: compute the composed transform for the active layer + group
// ========================================================================

/**
 * Get the composed transform for the active layer, including parent group
 * transforms if the layer belongs to a group.
 *
 * Returns null if there's no active layer or layers array is empty.
 * Returns the transform even if it's identity (caller checks hasTransform).
 */
function getActiveComposedTransform(): ComposedTransform | null {
  const tl = useTimelineStore.getState();
  if (tl.layers.length === 0 || !tl.view.activeLayerId) return null;

  const layer = tl.layers.find((l) => l.id === tl.view.activeLayerId);
  if (!layer) return null;

  return getComposedTransformForLayer(layer, tl.view.currentFrame, tl.layerGroups);
}

function hasNonIdentityTransform(t: ComposedTransform): boolean {
  return (
    t.positionX !== 0 ||
    t.positionY !== 0 ||
    t.scaleX !== 1 ||
    t.scaleY !== 1 ||
    t.rotation !== 0 ||
    t.anchorPointX !== 0 ||
    t.anchorPointY !== 0
  );
}

// ========================================================================
// Public API
// ========================================================================

/**
 * Convert a single screen-space cell coordinate to layer-local space.
 * Accounts for the active layer's transform AND its parent group transform.
 * Returns the input unchanged if no transform is active.
 */
export function screenToLocal(x: number, y: number): { x: number; y: number } {
  const transform = getActiveComposedTransform();
  if (!transform || !hasNonIdentityTransform(transform)) return { x, y };
  return inverseTransformPoint(x, y, transform);
}

/**
 * Forward-transform a single local-space coordinate to screen-space.
 * This is the same transform the compositing renderer applies.
 * Accounts for the active layer's transform AND its parent group transform.
 */
export function localToScreen(x: number, y: number): { x: number; y: number } {
  const transform = getActiveComposedTransform();
  if (!transform || !hasNonIdentityTransform(transform)) return { x, y };

  const { positionX, positionY, scaleX, scaleY, rotation, anchorPointX, anchorPointY } = transform;
  const localX = x - anchorPointX;
  const localY = y - anchorPointY;
  const scaledX = localX * scaleX;
  const scaledY = localY * scaleY;
  const { rotatedX, rotatedY } = applyRotation(scaledX, scaledY, rotation);
  return {
    x: Math.round(rotatedX + anchorPointX + positionX),
    y: Math.round(rotatedY + anchorPointY + positionY),
  };
}

/**
 * Transform a Map of cells keyed by "x,y" from screen-space to layer-local space.
 * Used by tools that bulk-write via setCanvasData (bezier, gradient, ascii type, etc.).
 * Accounts for group transforms.
 *
 * Returns a new Map with re-keyed coordinates. Cell data is preserved.
 */
export function transformCellMapToLocal(cells: Map<string, Cell>): Map<string, Cell> {
  const transform = getActiveComposedTransform();
  if (!transform || !hasNonIdentityTransform(transform)) return cells;

  const result = new Map<string, Cell>();
  cells.forEach((cell, key) => {
    const [sx, sy] = key.split(',').map(Number);
    const local = inverseTransformPoint(sx, sy, transform);
    result.set(`${local.x},${local.y}`, cell);
  });
  return result;
}

/**
 * Transform a Map of cells keyed by "x,y" from layer-local space to screen-space.
 * Used by preview renderers that need to display local-space data in composited view.
 * Accounts for group transforms.
 */
export function transformCellMapToScreen(cells: Map<string, Cell>): Map<string, Cell> {
  const transform = getActiveComposedTransform();
  if (!transform || !hasNonIdentityTransform(transform)) return cells;

  const { positionX, positionY, scaleX, scaleY, rotation, anchorPointX, anchorPointY } = transform;

  const result = new Map<string, Cell>();
  cells.forEach((cell, key) => {
    const [lx, ly] = key.split(',').map(Number);
    const localX = lx - anchorPointX;
    const localY = ly - anchorPointY;
    const scaledX = localX * scaleX;
    const scaledY = localY * scaleY;
    const { rotatedX, rotatedY } = applyRotation(scaledX, scaledY, rotation);
    const sx = Math.round(rotatedX + anchorPointX + positionX);
    const sy = Math.round(rotatedY + anchorPointY + positionY);
    result.set(`${sx},${sy}`, cell);
  });
  return result;
}
