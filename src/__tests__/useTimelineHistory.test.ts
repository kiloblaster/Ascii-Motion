/**
 * useTimelineHistory Hook Tests
 * 
 * Tests for src/hooks/useTimelineHistory.ts
 * Verifies that all timeline mutations are recorded in undo/redo history.
 * 
 * We test the core recording behavior by mocking toolStore.pushToHistory.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimelineStore } from '../stores/timelineStore';
import { useTimelineHistory } from '../hooks/useTimelineHistory';
import type { LayerId, ContentFrameId, PropertyTrackId, KeyframeId } from '../types/timeline';

// ============================================
// Mock toolStore's pushToHistory
// ============================================

const mockPushToHistory = vi.fn();

const mockToolStoreState = {
  pushToHistory: mockPushToHistory,
};

vi.mock('../stores/toolStore', () => ({
  useToolStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    if (typeof selector === 'function') return selector(mockToolStoreState);
    return mockToolStoreState;
  },
}));

// ============================================
// Helper
// ============================================

function resetAll() {
  useTimelineStore.getState().createNewProject();
  mockPushToHistory.mockClear();
}

describe('useTimelineHistory', () => {
  beforeEach(resetAll);

  // ── Layer operations ──

  describe('layer operations', () => {
    it('addLayer records a layer_add history action', () => {
      const { result } = renderHook(() => useTimelineHistory());

      act(() => {
        result.current.addLayer('Test Layer');
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      const action = mockPushToHistory.mock.calls[0][0];
      expect(action.type).toBe('layer_add');
      expect(action.data.layerData.name).toBe('Test Layer');
    });

    it('removeLayer records a layer_remove history action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      
      let layerId: string;
      act(() => {
        layerId = result.current.addLayer('To Remove');
      });
      mockPushToHistory.mockClear();

      act(() => {
        result.current.removeLayer(layerId as LayerId);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      expect(mockPushToHistory.mock.calls[0][0].type).toBe('layer_remove');
    });

    it('duplicateLayer records a layer_add history action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;
      mockPushToHistory.mockClear();

      act(() => {
        result.current.duplicateLayer(layerId);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      const action = mockPushToHistory.mock.calls[0][0];
      expect(action.type).toBe('layer_add');
      expect(action.description).toContain('Duplicate');
    });

    it('reorderLayers records a layer_reorder history action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      act(() => {
        result.current.addLayer('Layer 2');
      });
      mockPushToHistory.mockClear();

      act(() => {
        result.current.reorderLayers(0, 1);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      expect(mockPushToHistory.mock.calls[0][0].type).toBe('layer_reorder');
    });

    it('renameLayer records a layer_rename history action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;
      mockPushToHistory.mockClear();

      act(() => {
        result.current.renameLayer(layerId, 'New Name');
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      const action = mockPushToHistory.mock.calls[0][0];
      expect(action.type).toBe('layer_rename');
      expect(action.data.oldName).toBe('Layer 1');
      expect(action.data.newName).toBe('New Name');
    });

    it('setLayerVisible records a layer_visibility history action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;
      mockPushToHistory.mockClear();

      act(() => {
        result.current.setLayerVisible(layerId, false);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      const action = mockPushToHistory.mock.calls[0][0];
      expect(action.type).toBe('layer_visibility');
      expect(action.data.oldVisible).toBe(true);
      expect(action.data.newVisible).toBe(false);
    });

    it('setLayerOpacity records a layer_opacity history action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;
      mockPushToHistory.mockClear();

      act(() => {
        result.current.setLayerOpacity(layerId, 50);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      const action = mockPushToHistory.mock.calls[0][0];
      expect(action.type).toBe('layer_opacity');
      expect(action.data.oldOpacity).toBe(100);
      expect(action.data.newOpacity).toBe(50);
    });
  });

  // ── Content frame operations ──

  describe('content frame operations', () => {
    it('addContentFrame records a content_frame_add history action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;
      mockPushToHistory.mockClear();

      act(() => {
        result.current.addContentFrame(layerId, 5, 3);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      expect(mockPushToHistory.mock.calls[0][0].type).toBe('content_frame_add');
    });

    it('addContentFrame does not record history when rejected (overlap)', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;
      mockPushToHistory.mockClear();

      act(() => {
        result.current.addContentFrame(layerId, 0, 1); // Overlaps default frame
      });

      // Should not record history for rejected operation
      expect(mockPushToHistory).not.toHaveBeenCalled();
    });

    it('removeContentFrame records a content_frame_remove history action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;

      let frameId: ContentFrameId | null;
      act(() => {
        frameId = result.current.addContentFrame(layerId, 5, 3);
      });
      mockPushToHistory.mockClear();

      act(() => {
        result.current.removeContentFrame(layerId, frameId);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      expect(mockPushToHistory.mock.calls[0][0].type).toBe('content_frame_remove');
    });

    it('updateContentFrameTiming records a content_frame_timing action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;

      let frameId: ContentFrameId | null;
      act(() => {
        frameId = result.current.addContentFrame(layerId, 5, 3);
      });
      mockPushToHistory.mockClear();

      act(() => {
        result.current.updateContentFrameTiming(layerId, frameId, 10, 4);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      const action = mockPushToHistory.mock.calls[0][0];
      expect(action.type).toBe('content_frame_timing');
      expect(action.data.oldTiming.startFrame).toBe(5);
      expect(action.data.newTiming.startFrame).toBe(10);
    });
  });

  // ── Keyframe operations ──

  describe('keyframe operations', () => {
    it('addPropertyTrack records a property_track_add action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;
      mockPushToHistory.mockClear();

      act(() => {
        result.current.addPropertyTrack(layerId, 'transform.rotation');
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      expect(mockPushToHistory.mock.calls[0][0].type).toBe('property_track_add');
    });

    it('addKeyframe records a keyframe_add action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;

      let trackId: PropertyTrackId;
      act(() => {
        trackId = result.current.addPropertyTrack(layerId, 'transform.rotation');
      });
      mockPushToHistory.mockClear();

      act(() => {
        result.current.addKeyframe(layerId, trackId, 10, 50);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      const action = mockPushToHistory.mock.calls[0][0];
      expect(action.type).toBe('keyframe_add');
      expect(action.data.keyframe.frame).toBe(10);
      expect(action.data.keyframe.value).toBe(50);
    });

    it('removeKeyframe records a keyframe_remove action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;

      let trackId: PropertyTrackId;
      let kfId: KeyframeId;
      act(() => {
        trackId = result.current.addPropertyTrack(layerId, 'transform.rotation');
      });
      act(() => {
        kfId = result.current.addKeyframe(layerId, trackId, 10, 50);
      });
      mockPushToHistory.mockClear();

      act(() => {
        result.current.removeKeyframe(layerId, trackId, kfId);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      expect(mockPushToHistory.mock.calls[0][0].type).toBe('keyframe_remove');
    });

    it('updateKeyframe records a keyframe_update action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      const layerId = useTimelineStore.getState().layers[0].id;

      let trackId: PropertyTrackId;
      let kfId: KeyframeId;
      act(() => {
        trackId = result.current.addPropertyTrack(layerId, 'transform.rotation');
      });
      act(() => {
        kfId = result.current.addKeyframe(layerId, trackId, 10, 50);
      });
      mockPushToHistory.mockClear();

      act(() => {
        result.current.updateKeyframe(layerId, trackId, kfId, { value: 75 });
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      const action = mockPushToHistory.mock.calls[0][0];
      expect(action.type).toBe('keyframe_update');
      expect(action.data.oldValue.value).toBe(50);
      expect(action.data.newValue.value).toBe(75);
    });
  });

  // ── Frame rate ──

  describe('frame rate', () => {
    it('setFrameRate records a frame_rate_change action', () => {
      const { result } = renderHook(() => useTimelineHistory());
      mockPushToHistory.mockClear();

      act(() => {
        result.current.setFrameRate(24);
      });

      expect(mockPushToHistory).toHaveBeenCalledTimes(1);
      const action = mockPushToHistory.mock.calls[0][0];
      expect(action.type).toBe('frame_rate_change');
      expect(action.data.oldFps).toBe(12);
      expect(action.data.newFps).toBe(24);
    });
  });
});
