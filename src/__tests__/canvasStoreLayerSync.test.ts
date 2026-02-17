/**
 * Canvas Store Layer Sync Tests — Phase 2
 * 
 * Tests the canvas store's layer integration including:
 * - activeLayerId state
 * - isDirty tracking on cell mutations
 * - setDirty action
 * - setActiveLayerId action
 * - setCanvasData does NOT mark dirty (sync-in)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from '../stores/canvasStore';
import type { Cell } from '../types';
import type { LayerId } from '../types/timeline';

function resetCanvas() {
  const store = useCanvasStore.getState();
  store.clearCanvas();
  store.setCanvasSize(10, 10);
  store.setActiveLayerId(null);
  store.setDirty(false);
}

function cell(char = 'X', color = '#FFFFFF', bgColor = 'transparent'): Cell {
  return { char, color, bgColor };
}

describe('canvasStore layer sync', () => {
  beforeEach(() => {
    resetCanvas();
  });

  // ============================================
  // INITIAL STATE
  // ============================================

  describe('initial state', () => {
    it('activeLayerId starts as null', () => {
      expect(useCanvasStore.getState().activeLayerId).toBeNull();
    });

    it('isDirty starts as false', () => {
      expect(useCanvasStore.getState().isDirty).toBe(false);
    });
  });

  // ============================================
  // setActiveLayerId
  // ============================================

  describe('setActiveLayerId', () => {
    it('sets the active layer id', () => {
      const layerId = 'layer-1-abc' as LayerId;
      useCanvasStore.getState().setActiveLayerId(layerId);
      expect(useCanvasStore.getState().activeLayerId).toBe(layerId);
    });

    it('can be set back to null', () => {
      useCanvasStore.getState().setActiveLayerId('layer-1-abc' as LayerId);
      useCanvasStore.getState().setActiveLayerId(null);
      expect(useCanvasStore.getState().activeLayerId).toBeNull();
    });
  });

  // ============================================
  // isDirty TRACKING
  // ============================================

  describe('isDirty tracking', () => {
    it('setCell marks isDirty true', () => {
      useCanvasStore.getState().setCell(0, 0, cell());
      expect(useCanvasStore.getState().isDirty).toBe(true);
    });

    it('clearCell marks isDirty true', () => {
      // First set a cell, reset dirty, then clear
      useCanvasStore.getState().setCell(0, 0, cell());
      useCanvasStore.getState().setDirty(false);
      useCanvasStore.getState().clearCell(0, 0);
      expect(useCanvasStore.getState().isDirty).toBe(true);
    });

    it('clearCanvas marks isDirty true', () => {
      useCanvasStore.getState().setCell(0, 0, cell());
      useCanvasStore.getState().setDirty(false);
      useCanvasStore.getState().clearCanvas();
      expect(useCanvasStore.getState().isDirty).toBe(true);
    });

    it('fillArea marks isDirty true', () => {
      useCanvasStore.getState().setDirty(false);
      useCanvasStore.getState().fillArea(0, 0, cell('*'));
      expect(useCanvasStore.getState().isDirty).toBe(true);
    });

    it('setCanvasData does NOT mark dirty (used for sync-in)', () => {
      useCanvasStore.getState().setDirty(false);
      const data = new Map<string, Cell>();
      data.set('0,0', cell('A'));
      useCanvasStore.getState().setCanvasData(data);
      expect(useCanvasStore.getState().isDirty).toBe(false);
    });
  });

  // ============================================
  // setDirty
  // ============================================

  describe('setDirty', () => {
    it('setDirty(false) resets the flag', () => {
      useCanvasStore.getState().setCell(0, 0, cell());
      expect(useCanvasStore.getState().isDirty).toBe(true);
      useCanvasStore.getState().setDirty(false);
      expect(useCanvasStore.getState().isDirty).toBe(false);
    });

    it('setDirty(true) sets the flag', () => {
      useCanvasStore.getState().setDirty(true);
      expect(useCanvasStore.getState().isDirty).toBe(true);
    });
  });

  // ============================================
  // setCanvasData (sync-in)
  // ============================================

  describe('setCanvasData', () => {
    it('replaces current cells with provided data', () => {
      useCanvasStore.getState().setCell(0, 0, cell('Old'));
      const data = new Map<string, Cell>();
      data.set('5,5', cell('New'));
      useCanvasStore.getState().setCanvasData(data);

      // getCell returns a default empty cell for missing positions, so check the Map directly
      expect(useCanvasStore.getState().cells.has('0,0')).toBe(false);
      expect(useCanvasStore.getState().getCell(5, 5)?.char).toBe('New');
    });

    it('makes a defensive copy of the provided map', () => {
      const data = new Map<string, Cell>();
      data.set('0,0', cell('A'));
      useCanvasStore.getState().setCanvasData(data);

      // Modify the original map — store should not be affected
      data.set('0,0', cell('B'));
      expect(useCanvasStore.getState().getCell(0, 0)?.char).toBe('A');
    });
  });

  // ============================================
  // INTERACTION PATTERNS
  // ============================================

  describe('interaction patterns', () => {
    it('switching active layer resets to clean state', () => {
      // Simulate: draw on layer 1, switch to layer 2
      useCanvasStore.getState().setActiveLayerId('layer-1' as LayerId);
      useCanvasStore.getState().setCell(0, 0, cell('X'));
      expect(useCanvasStore.getState().isDirty).toBe(true);

      // Switch layer: reset dirty, load new data
      const layer2Data = new Map<string, Cell>();
      layer2Data.set('3,3', cell('Y'));
      useCanvasStore.getState().setCanvasData(layer2Data);
      useCanvasStore.getState().setActiveLayerId('layer-2' as LayerId);
      useCanvasStore.getState().setDirty(false);

      expect(useCanvasStore.getState().activeLayerId).toBe('layer-2');
      expect(useCanvasStore.getState().isDirty).toBe(false);
      // Old cell at (0,0) should be gone from the map
      expect(useCanvasStore.getState().cells.has('0,0')).toBe(false);
      expect(useCanvasStore.getState().getCell(3, 3)?.char).toBe('Y');
    });

    it('multiple draws accumulate dirty state', () => {
      useCanvasStore.getState().setCell(0, 0, cell('A'));
      useCanvasStore.getState().setCell(1, 1, cell('B'));
      useCanvasStore.getState().setCell(2, 2, cell('C'));
      expect(useCanvasStore.getState().isDirty).toBe(true);
      expect(useCanvasStore.getState().cells.size).toBe(3);
    });
  });
});
