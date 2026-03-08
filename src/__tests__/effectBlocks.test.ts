/**
 * Effect Block Store Action Tests
 *
 * Tests for effect track actions in timelineStore.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '../stores/timelineStore';
import { clearEffectRegistry } from '../registry/effectRegistry';
import { registerAllEffects } from '../registry/effects';
import type { LayerId, LayerGroupId } from '../types/timeline';
import type { EffectBlockId } from '../types/effectBlock';

function resetStore() {
  useTimelineStore.getState().createNewProject();
}

describe('effectBlocks', () => {
  beforeEach(() => {
    clearEffectRegistry();
    registerAllEffects();
    resetStore();
  });

  describe('addEffectBlock', () => {
    it('adds an effect block to the active layer', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      const blockId = state.addEffectBlock(layerId, 'levels', 0, 10);
      expect(blockId).toBeTruthy();
      const updated = useTimelineStore.getState().layers[0];
      expect(updated.effectTracks).toHaveLength(1);
      expect(updated.effectTracks[0].effectBlock.effectType).toBe('levels');
      expect(updated.effectTracks[0].effectBlock.startFrame).toBe(0);
      expect(updated.effectTracks[0].effectBlock.durationFrames).toBe(10);
      expect(updated.effectTracks[0].effectBlock.enabled).toBe(true);
    });

    it('adds a global effect block when ownerId is null', () => {
      const state = useTimelineStore.getState();
      const blockId = state.addEffectBlock(null, 'scatter', 5, 20);
      expect(blockId).toBeTruthy();
      const global = useTimelineStore.getState().globalEffects;
      expect(global).toHaveLength(1);
      expect(global[0].effectBlock.effectType).toBe('scatter');
    });

    it('populates default settings from registry', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      state.addEffectBlock(layerId, 'levels', 0, 10);
      const block = useTimelineStore.getState().layers[0].effectTracks[0].effectBlock;
      expect(block.settings).toBeDefined();
      expect(block.settings.shadowsInput).toBe(0);
      expect(block.settings.highlightsInput).toBe(255);
    });
  });

  describe('removeEffectBlock', () => {
    it('removes an effect block from a layer', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      const blockId = state.addEffectBlock(layerId, 'levels', 0, 10)!;
      expect(useTimelineStore.getState().layers[0].effectTracks).toHaveLength(1);
      useTimelineStore.getState().removeEffectBlock(layerId, blockId);
      expect(useTimelineStore.getState().layers[0].effectTracks).toHaveLength(0);
    });

    it('removes a global effect block', () => {
      const state = useTimelineStore.getState();
      const blockId = state.addEffectBlock(null, 'scatter', 0, 10)!;
      expect(useTimelineStore.getState().globalEffects).toHaveLength(1);
      useTimelineStore.getState().removeEffectBlock(null, blockId);
      expect(useTimelineStore.getState().globalEffects).toHaveLength(0);
    });
  });

  describe('updateEffectBlockTiming', () => {
    it('updates start frame and duration', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      const blockId = state.addEffectBlock(layerId, 'levels', 0, 10)!;
      useTimelineStore.getState().updateEffectBlockTiming(blockId, 5, 20);
      const block = useTimelineStore.getState().layers[0].effectTracks[0].effectBlock;
      expect(block.startFrame).toBe(5);
      expect(block.durationFrames).toBe(20);
    });
  });

  describe('updateEffectBlockSettings', () => {
    it('merges new settings with existing ones', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      const blockId = state.addEffectBlock(layerId, 'levels', 0, 10)!;
      useTimelineStore.getState().updateEffectBlockSettings(blockId, { shadowsInput: 50 });
      const block = useTimelineStore.getState().layers[0].effectTracks[0].effectBlock;
      expect(block.settings.shadowsInput).toBe(50);
      // Other settings should still exist
      expect(block.settings.highlightsInput).toBe(255);
    });
  });

  describe('toggleEffectBlockEnabled', () => {
    it('toggles the enabled state', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      const blockId = state.addEffectBlock(layerId, 'levels', 0, 10)!;
      expect(useTimelineStore.getState().layers[0].effectTracks[0].effectBlock.enabled).toBe(true);
      useTimelineStore.getState().toggleEffectBlockEnabled(blockId);
      expect(useTimelineStore.getState().layers[0].effectTracks[0].effectBlock.enabled).toBe(false);
      useTimelineStore.getState().toggleEffectBlockEnabled(blockId);
      expect(useTimelineStore.getState().layers[0].effectTracks[0].effectBlock.enabled).toBe(true);
    });
  });

  describe('reorderEffectTracks', () => {
    it('changes track order (z-order)', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      state.addEffectBlock(layerId, 'levels', 0, 10);
      state.addEffectBlock(layerId, 'scatter', 0, 10);
      const tracks = useTimelineStore.getState().layers[0].effectTracks;
      expect(tracks[0].effectBlock.effectType).toBe('levels');
      expect(tracks[1].effectBlock.effectType).toBe('scatter');
      useTimelineStore.getState().reorderEffectTracks(layerId, 0, 1);
      const reordered = useTimelineStore.getState().layers[0].effectTracks;
      expect(reordered[0].effectBlock.effectType).toBe('scatter');
      expect(reordered[1].effectBlock.effectType).toBe('levels');
    });
  });

  describe('view state', () => {
    it('selectEffectBlock sets selectedEffectBlockId', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      const blockId = state.addEffectBlock(layerId, 'levels', 0, 10)!;
      useTimelineStore.getState().selectEffectBlock(blockId);
      expect(useTimelineStore.getState().view.selectedEffectBlockId).toBe(blockId);
      useTimelineStore.getState().selectEffectBlock(null);
      expect(useTimelineStore.getState().view.selectedEffectBlockId).toBeNull();
    });

    it('toggleEffectTrackExpanded toggles the set', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      const blockId = state.addEffectBlock(layerId, 'levels', 0, 10)!;
      useTimelineStore.getState().toggleEffectTrackExpanded(blockId);
      expect(useTimelineStore.getState().view.expandedEffectTrackIds.has(blockId)).toBe(true);
      useTimelineStore.getState().toggleEffectTrackExpanded(blockId);
      expect(useTimelineStore.getState().view.expandedEffectTrackIds.has(blockId)).toBe(false);
    });
  });

  describe('multiple effects stacking', () => {
    it('supports multiple effect tracks on one layer', () => {
      const state = useTimelineStore.getState();
      const layerId = state.layers[0].id;
      state.addEffectBlock(layerId, 'levels', 0, 10);
      state.addEffectBlock(layerId, 'hue-saturation', 0, 10);
      state.addEffectBlock(layerId, 'scatter', 5, 15);
      expect(useTimelineStore.getState().layers[0].effectTracks).toHaveLength(3);
    });
  });
});
