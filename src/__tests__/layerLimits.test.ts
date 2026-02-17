/**
 * Layer Limits Tests — Phase 2
 * 
 * Tests the layer limit enforcement system including:
 * - canAddLayer() gate
 * - Subscription tier limit registration
 * - Import layer count calculation
 * - Integration with timelineStore addLayer/duplicateLayer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTimelineStore } from '../stores/timelineStore';
import {
  canAddLayer,
  getImportableLayerCount,
  getRemainingLayerCount,
  getSubscriptionLayerLimit,
  registerSubscriptionLayerLimit,
  FREE_TIER_MAX_LAYERS,
  UNLIMITED_LAYERS,
} from '../utils/layerLimits';
import { resetIdCounters } from '../types/timeline';

function resetStore() {
  resetIdCounters();
  useTimelineStore.getState().createNewProject();
}

describe('layerLimits', () => {
  beforeEach(() => {
    resetStore();
    // Reset to default (free tier) limit
    registerSubscriptionLayerLimit(() => FREE_TIER_MAX_LAYERS);
  });

  afterEach(() => {
    // Always restore to free tier to avoid test leakage
    registerSubscriptionLayerLimit(() => FREE_TIER_MAX_LAYERS);
  });

  // ============================================
  // CONSTANTS
  // ============================================

  describe('constants', () => {
    it('FREE_TIER_MAX_LAYERS is 5', () => {
      expect(FREE_TIER_MAX_LAYERS).toBe(5);
    });

    it('UNLIMITED_LAYERS sentinel is -1', () => {
      expect(UNLIMITED_LAYERS).toBe(-1);
    });
  });

  // ============================================
  // getSubscriptionLayerLimit
  // ============================================

  describe('getSubscriptionLayerLimit', () => {
    it('defaults to FREE_TIER_MAX_LAYERS', () => {
      registerSubscriptionLayerLimit(() => FREE_TIER_MAX_LAYERS);
      expect(getSubscriptionLayerLimit()).toBe(FREE_TIER_MAX_LAYERS);
    });

    it('returns custom limit after registration', () => {
      registerSubscriptionLayerLimit(() => 10);
      expect(getSubscriptionLayerLimit()).toBe(10);
    });

    it('supports UNLIMITED_LAYERS sentinel', () => {
      registerSubscriptionLayerLimit(() => UNLIMITED_LAYERS);
      expect(getSubscriptionLayerLimit()).toBe(UNLIMITED_LAYERS);
    });
  });

  // ============================================
  // canAddLayer
  // ============================================

  describe('canAddLayer', () => {
    it('allows adding when under the limit', () => {
      // Initial state: 1 layer, limit 5
      expect(canAddLayer()).toBe(true);
    });

    it('allows adding up to the limit', () => {
      // Add layers until we have 4 (limit is 5)
      useTimelineStore.getState().addLayer('Layer 2');
      useTimelineStore.getState().addLayer('Layer 3');
      useTimelineStore.getState().addLayer('Layer 4');
      expect(useTimelineStore.getState().layers).toHaveLength(4);
      expect(canAddLayer()).toBe(true); // Can add 1 more to reach 5
    });

    it('blocks adding at the limit', () => {
      // Have 1 layer, need to add 4 more to reach limit of 5
      useTimelineStore.getState().addLayer('Layer 2');
      useTimelineStore.getState().addLayer('Layer 3');
      useTimelineStore.getState().addLayer('Layer 4');
      useTimelineStore.getState().addLayer('Layer 5');
      expect(useTimelineStore.getState().layers).toHaveLength(5);
      expect(canAddLayer()).toBe(false);
    });

    it('allows unlimited adding with UNLIMITED_LAYERS sentinel', () => {
      registerSubscriptionLayerLimit(() => UNLIMITED_LAYERS);
      // Add many layers
      for (let i = 2; i <= 20; i++) {
        useTimelineStore.getState().addLayer(`Layer ${i}`);
      }
      expect(useTimelineStore.getState().layers).toHaveLength(20);
      expect(canAddLayer()).toBe(true);
    });

    it('respects a custom small limit', () => {
      registerSubscriptionLayerLimit(() => 2);
      expect(canAddLayer()).toBe(true); // 1 layer, limit 2
      useTimelineStore.getState().addLayer('Layer 2');
      expect(canAddLayer()).toBe(false); // 2 layers, limit 2
    });
  });

  // ============================================
  // getImportableLayerCount
  // ============================================

  describe('getImportableLayerCount', () => {
    it('returns incoming count when under limit', () => {
      // 1 layer, limit 5 → can import up to 4
      expect(getImportableLayerCount(3)).toBe(3);
    });

    it('truncates when import would exceed limit', () => {
      // 1 layer, limit 5 → can import max 4
      expect(getImportableLayerCount(10)).toBe(4);
    });

    it('returns 0 when at limit', () => {
      for (let i = 2; i <= 5; i++) {
        useTimelineStore.getState().addLayer(`Layer ${i}`);
      }
      expect(getImportableLayerCount(5)).toBe(0);
    });

    it('returns full count for unlimited tier', () => {
      registerSubscriptionLayerLimit(() => UNLIMITED_LAYERS);
      expect(getImportableLayerCount(100)).toBe(100);
    });
  });

  // ============================================
  // getRemainingLayerCount
  // ============================================

  describe('getRemainingLayerCount', () => {
    it('returns remaining slots', () => {
      // 1 layer, limit 5
      expect(getRemainingLayerCount()).toBe(4);
    });

    it('returns 0 when at limit', () => {
      for (let i = 2; i <= 5; i++) {
        useTimelineStore.getState().addLayer(`Layer ${i}`);
      }
      expect(getRemainingLayerCount()).toBe(0);
    });

    it('returns Infinity for unlimited tier', () => {
      registerSubscriptionLayerLimit(() => UNLIMITED_LAYERS);
      expect(getRemainingLayerCount()).toBe(Infinity);
    });

    it('decrements correctly as layers are added', () => {
      expect(getRemainingLayerCount()).toBe(4);
      useTimelineStore.getState().addLayer('L2');
      expect(getRemainingLayerCount()).toBe(3);
      useTimelineStore.getState().addLayer('L3');
      expect(getRemainingLayerCount()).toBe(2);
    });
  });

  // ============================================
  // timelineStore integration
  // ============================================

  describe('timelineStore integration', () => {
    it('addLayer returns null when at limit', () => {
      for (let i = 2; i <= 5; i++) {
        useTimelineStore.getState().addLayer(`Layer ${i}`);
      }
      expect(useTimelineStore.getState().layers).toHaveLength(5);

      const result = useTimelineStore.getState().addLayer('Should fail');
      expect(result).toBeNull();
      expect(useTimelineStore.getState().layers).toHaveLength(5);
    });

    it('addLayer succeeds when under limit', () => {
      const result = useTimelineStore.getState().addLayer('New Layer');
      expect(result).not.toBeNull();
      expect(useTimelineStore.getState().layers).toHaveLength(2);
    });

    it('duplicateLayer does not duplicate when at limit', () => {
      for (let i = 2; i <= 5; i++) {
        useTimelineStore.getState().addLayer(`Layer ${i}`);
      }
      expect(useTimelineStore.getState().layers).toHaveLength(5);

      const firstLayerId = useTimelineStore.getState().layers[0].id;
      const result = useTimelineStore.getState().duplicateLayer(firstLayerId);
      // duplicateLayer returns null when limit is reached
      expect(result).toBeNull();
      expect(useTimelineStore.getState().layers).toHaveLength(5);
    });

    it('removing a layer allows adding again', () => {
      for (let i = 2; i <= 5; i++) {
        useTimelineStore.getState().addLayer(`Layer ${i}`);
      }
      expect(canAddLayer()).toBe(false);

      const lastLayer = useTimelineStore.getState().layers[4];
      useTimelineStore.getState().removeLayer(lastLayer.id);
      expect(useTimelineStore.getState().layers).toHaveLength(4);
      expect(canAddLayer()).toBe(true);
    });

    it('addLayer limit respects tier upgrade', () => {
      // Fill to free tier limit
      for (let i = 2; i <= 5; i++) {
        useTimelineStore.getState().addLayer(`Layer ${i}`);
      }
      expect(canAddLayer()).toBe(false);

      // "Upgrade" to higher tier
      registerSubscriptionLayerLimit(() => 10);
      expect(canAddLayer()).toBe(true);
      const newId = useTimelineStore.getState().addLayer('Layer 6');
      expect(newId).not.toBeNull();
      expect(useTimelineStore.getState().layers).toHaveLength(6);
    });
  });
});
