/**
 * useLayerLimit Hook
 * 
 * React hook for layer limit enforcement in UI components.
 * Wraps the subscription tier layer limit logic for component use.
 * 
 * Part of the Layer Timeline Refactor (Phase 2)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §2.2
 */

import { useMemo } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import {
  getSubscriptionLayerLimit,
  UNLIMITED_LAYERS,
} from '../utils/layerLimits';

export interface LayerLimitInfo {
  /** Maximum layers allowed (-1 = unlimited) */
  maxLayers: number;
  /** Whether a new layer can be added */
  canAddLayer: boolean;
  /** Remaining layers that can be added (Infinity for unlimited) */
  remainingLayers: number;
  /** Current layer count */
  layerCount: number;
  /** Whether the current tier has unlimited layers */
  isUnlimited: boolean;
}

/**
 * React hook for checking layer limits in UI components.
 * 
 * @example
 * ```tsx
 * function AddLayerButton() {
 *   const { canAddLayer, remainingLayers, isUnlimited } = useLayerLimit();
 *   return (
 *     <button disabled={!canAddLayer} onClick={handleAddLayer}>
 *       Add Layer {!isUnlimited && `(${remainingLayers} remaining)`}
 *     </button>
 *   );
 * }
 * ```
 */
export function useLayerLimit(): LayerLimitInfo {
  const layerCount = useTimelineStore((s) => s.layers.length);

  return useMemo(() => {
    const maxLayers = getSubscriptionLayerLimit();
    const isUnlimited = maxLayers === UNLIMITED_LAYERS;
    const canAdd = isUnlimited || layerCount < maxLayers;
    const remaining = isUnlimited ? Infinity : Math.max(0, maxLayers - layerCount);

    return {
      maxLayers,
      canAddLayer: canAdd,
      remainingLayers: remaining,
      layerCount,
      isUnlimited,
    };
  }, [layerCount]);
}
