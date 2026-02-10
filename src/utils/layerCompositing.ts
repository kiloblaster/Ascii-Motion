/**
 * Layer Compositing Utilities
 * 
 * Composites all visible layers at a given frame into a single Map<string, Cell>
 * for rendering. Handles visibility, solo mode, opacity, and transform properties
 * (position, scale, rotation) with keyframe interpolation.
 * 
 * Rendering order: First layer in array = bottom (rendered first)
 * Cell priority: Top layer's non-empty cell overwrites lower layers
 * 
 * Part of the Layer Timeline Refactor (Phase 2)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §2.4
 */

import type { Cell } from '../types';
import type {
  Layer,
  ContentFrame,
  PropertyPath,
  PropertyTrack,
} from '../types/timeline';
import { PROPERTY_DEFINITIONS } from '../types/timeline';
import { interpolateKeyframes } from '../types/easing';
import { CELL_ASPECT_RATIO } from '../utils/fontMetrics';

// ============================================
// MAIN COMPOSITING FUNCTION
// ============================================

/**
 * Composite all visible layers at a given frame.
 * Returns a Map of cells for rendering.
 * 
 * @param layers - Array of layers ordered by z-index (first = bottom)
 * @param frame - Current frame number
 * @param canvasWidth - Canvas width in cells
 * @param canvasHeight - Canvas height in cells
 * @param cellAspectRatio - Cell width/height ratio for rotation compensation
 * @returns Composited cell map ready for rendering
 */
export function compositeLayersAtFrame(
  layers: Layer[],
  frame: number,
  canvasWidth: number,
  canvasHeight: number,
  cellAspectRatio: number = CELL_ASPECT_RATIO,
  clip: boolean = true,
): Map<string, Cell> {
  const result = new Map<string, Cell>();

  // Check if any layer is solo'd
  const hasSoloLayer = layers.some((l) => l.solo);

  // Iterate layers from bottom to top (first in array = bottom)
  for (const layer of layers) {
    // Skip invisible layers
    if (!layer.visible) continue;

    // If any layer is solo'd, only render solo'd layers
    if (hasSoloLayer && !layer.solo) continue;

    // Get content frame at this time
    const contentFrame = getContentFrameAtTime(layer, frame);
    if (!contentFrame) continue;

    // Get transform values at this frame via keyframe interpolation
    const posX = getPropertyValueAtFrame(layer, 'transform.position.x', frame);
    const posY = getPropertyValueAtFrame(layer, 'transform.position.y', frame);
    const scale = getPropertyValueAtFrame(layer, 'transform.scale', frame);
    const rotation = getPropertyValueAtFrame(layer, 'transform.rotation', frame);
    const anchorX = getPropertyValueAtFrame(layer, 'transform.anchorPoint.x', frame);
    const anchorY = getPropertyValueAtFrame(layer, 'transform.anchorPoint.y', frame);

    // Check if transforms are identity (common case — skip expensive math)
    const hasTransform =
      posX !== 0 ||
      posY !== 0 ||
      scale !== 1 ||
      rotation !== 0 ||
      anchorX !== 0 ||
      anchorY !== 0;

    // Apply each cell from the content frame
    for (const [coordKey, cell] of contentFrame.data) {
      // Skip empty cells
      if (!cell.char || cell.char === ' ') continue;

      let finalX: number;
      let finalY: number;

      if (hasTransform) {
        const [x, y] = coordKey.split(',').map(Number);

        // Apply anchor point offset
        const localX = x - anchorX;
        const localY = y - anchorY;

        // Apply scale (snap to whole cells)
        const scaledX = localX * scale;
        const scaledY = localY * scale;

        // Apply rotation
        const { rotatedX, rotatedY } = applyRotation(
          scaledX,
          scaledY,
          rotation,
          cellAspectRatio,
        );

        // Apply position offset and re-add anchor
        finalX = Math.round(rotatedX + anchorX + posX);
        finalY = Math.round(rotatedY + anchorY + posY);
      } else {
        // No transform — use coordinates directly (fast path)
        const commaIdx = coordKey.indexOf(',');
        finalX = parseInt(coordKey.substring(0, commaIdx), 10);
        finalY = parseInt(coordKey.substring(commaIdx + 1), 10);
      }

      // Bounds check (only when clipping for export)
      if (clip && (finalX < 0 || finalX >= canvasWidth || finalY < 0 || finalY >= canvasHeight)) {
        continue;
      }

      const finalKey = `${finalX},${finalY}`;

      // Top layer's cell wins (we iterate bottom-to-top, so overwrite)
      result.set(finalKey, cell);
    }
  }

  return result;
}

// ============================================
// CONTENT FRAME LOOKUP
// ============================================

/**
 * Get the content frame active at a given frame number for a layer.
 * Returns null if the frame falls in a gap between content frames.
 */
export function getContentFrameAtTime(layer: Layer, frame: number): ContentFrame | null {
  for (const cf of layer.contentFrames) {
    if (frame >= cf.startFrame && frame < cf.startFrame + cf.durationFrames) {
      return cf;
    }
  }
  return null;
}

// ============================================
// PROPERTY VALUE INTERPOLATION
// ============================================

/**
 * Get the interpolated value of a property at a specific frame for a layer.
 * Uses the keyframe interpolation system from easing.ts.
 * 
 * If the property has no track or no keyframes, returns the default value
 * from PROPERTY_DEFINITIONS.
 * 
 * @param layer - The layer to query
 * @param propertyPath - The property path (e.g., 'transform.position.x')
 * @param frame - The frame number to evaluate at
 * @returns The interpolated numeric value
 */
export function getPropertyValueAtFrame(
  layer: Layer,
  propertyPath: PropertyPath,
  frame: number,
): number {
  // Find the property track for this path
  const track = layer.propertyTracks.find((t) => t.propertyPath === propertyPath);

  if (!track || track.keyframes.length === 0) {
    // Check layer-specific static value first, then global default
    if (layer.staticProperties && propertyPath in layer.staticProperties) {
      return layer.staticProperties[propertyPath];
    }
    const def = PROPERTY_DEFINITIONS[propertyPath];
    return (def?.defaultValue as number) ?? 0;
  }

  // Use the keyframe interpolation system
  return interpolateKeyframes(track.keyframes, frame, track.loopKeyframes);
}

/**
 * Get all property values for a layer at a specific frame.
 * Convenience function that returns all transform properties at once.
 */
export function getTransformAtFrame(
  layer: Layer,
  frame: number,
): {
  positionX: number;
  positionY: number;
  scale: number;
  rotation: number;
  anchorPointX: number;
  anchorPointY: number;
} {
  return {
    positionX: getPropertyValueAtFrame(layer, 'transform.position.x', frame),
    positionY: getPropertyValueAtFrame(layer, 'transform.position.y', frame),
    scale: getPropertyValueAtFrame(layer, 'transform.scale', frame),
    rotation: getPropertyValueAtFrame(layer, 'transform.rotation', frame),
    anchorPointX: getPropertyValueAtFrame(layer, 'transform.anchorPoint.x', frame),
    anchorPointY: getPropertyValueAtFrame(layer, 'transform.anchorPoint.y', frame),
  };
}

// ============================================
// TRANSFORM HELPERS
// ============================================

/**
 * Apply rotation at 1° increments around the origin.
 * Accounts for cell aspect ratio (cells are typically taller than wide).
 * 
 * Cells rotated off-canvas are preserved in layer data — they simply
 * won't render. This prevents data loss when animating rotation.
 * 
 * @param x - X position after anchor/scale
 * @param y - Y position after anchor/scale
 * @param degrees - Rotation angle in degrees
 * @param cellAspectRatio - Cell width/height ratio (typically 0.6 for monospace)
 * @returns Rotated coordinates snapped to whole cells
 */
export function applyRotation(
  x: number,
  y: number,
  degrees: number,
  cellAspectRatio: number = CELL_ASPECT_RATIO,
): { rotatedX: number; rotatedY: number } {
  if (degrees === 0) return { rotatedX: x, rotatedY: y };

  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // Scale x to account for cell aspect ratio, making rotation visually correct
  const scaledX = x * cellAspectRatio;

  // Apply rotation
  const rotatedScaledX = scaledX * cos - y * sin;
  const rotatedY = scaledX * sin + y * cos;

  // Scale x back and snap to whole cells
  const rotatedX = Math.round(rotatedScaledX / cellAspectRatio);

  return { rotatedX, rotatedY: Math.round(rotatedY) };
}

// ============================================
// LAYER VISIBILITY HELPERS
// ============================================

/**
 * Get the list of layers that would be visible at render time.
 * Respects visibility and solo mode.
 */
export function getVisibleLayers(layers: Layer[]): Layer[] {
  const hasSoloLayer = layers.some((l) => l.solo);

  return layers.filter((layer) => {
    if (!layer.visible) return false;
    if (hasSoloLayer && !layer.solo) return false;
    return true;
  });
}

/**
 * Check if a layer is editable (visible and not locked).
 */
export function isLayerEditable(layer: Layer): boolean {
  return layer.visible && !layer.locked;
}

/**
 * Inverse-transform a screen-space cell coordinate back to layer-local space.
 * This is the reverse of the forward transform applied during compositing.
 *
 * Used by drawing tools so that drawing on the composited canvas writes
 * to the correct position in the layer's raw data.
 *
 * @param screenX - Cell X in composited (screen) space
 * @param screenY - Cell Y in composited (screen) space
 * @param transform - The layer's transform at the current frame
 * @returns Layer-local cell coordinates
 */
export function inverseTransformPoint(
  screenX: number,
  screenY: number,
  transform: ReturnType<typeof getTransformAtFrame>,
): { x: number; y: number } {
  const { positionX, positionY, scale, rotation, anchorPointX, anchorPointY } = transform;

  // 1. Remove position and anchor offset
  const relX = screenX - positionX - anchorPointX;
  const relY = screenY - positionY - anchorPointY;

  // 2. Inverse rotation (negate angle)
  const { rotatedX: invRotX, rotatedY: invRotY } = applyRotation(
    relX, relY, -rotation,
  );

  // 3. Inverse scale
  const localX = scale !== 0 ? Math.round(invRotX / scale + anchorPointX) : anchorPointX;
  const localY = scale !== 0 ? Math.round(invRotY / scale + anchorPointY) : anchorPointY;

  return { x: localX, y: localY };
}
