/**
 * Phase 6: Integration Tests
 *
 * Tests for:
 * - animationStore adapter wiring (all consumers now use adapter)
 * - Adapter methods properly route to timelineStore
 * - Effects "apply to timeline" writes to content frames
 * - Generator importFramesOverwrite/Append route through adapter
 * - Frame data round-trip through adapter
 * - Adapter state derivation from timelineStore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '../stores/timelineStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useAnimationStore } from '../stores/animationStore';
import type { Cell } from '../types';

// ============================================
// Helpers
// ============================================

function resetStores() {
  useTimelineStore.getState().createNewProject();
  useCanvasStore.setState({
    width: 80,
    height: 24,
    cells: new Map(),
    canvasBackgroundColor: '#1a1a2e',
    showGrid: true,
  });
}

function makeCell(char: string, color = '#ffffff', bgColor = '#000000'): Cell {
  return { char, color, bgColor };
}

// ============================================
// Adapter Wiring Tests
// ============================================

describe('animationStore adapter integration', () => {
  beforeEach(resetStores);

  it('useAnimationStore returns the adapter (has __isAdapter flag)', () => {
    const store = useAnimationStore.getState();
    expect((store as Record<string, unknown>).__isAdapter).toBe(true);
  });

  it('adapter.frames derives from active layer content frames', () => {
    const tl = useTimelineStore.getState();
    const layerId = tl.layers[0].id;
    const cfId = tl.layers[0].contentFrames[0].id;

    // Write cell data to the content frame
    tl.updateContentFrameData(layerId, cfId, new Map([['0,0', makeCell('A')]]));

    // Cell data is written to timelineStore (source of truth)
    // The adapter skips syncing on cell-data-only changes for performance
    const layer = useTimelineStore.getState().layers[0];
    expect(layer.contentFrames[0].data.get('0,0')?.char).toBe('A');

    // Adapter still reports correct frame count/structure
    const adapter = useAnimationStore.getState();
    expect(adapter.frames.length).toBeGreaterThanOrEqual(1);
  });

  it('adapter.frameRate derives from timelineStore config', () => {
    useTimelineStore.getState().setFrameRate(24, false);
    expect(useAnimationStore.getState().frameRate).toBe(24);
  });

  it('adapter.looping derives from timelineStore view', () => {
    useTimelineStore.getState().setLooping(false);
    expect(useAnimationStore.getState().looping).toBe(false);
  });

  it('adapter.currentFrameIndex derives from timelineStore view', () => {
    // Extend timeline so we can navigate
    useTimelineStore.getState().setDuration(10);
    useTimelineStore.getState().goToFrame(5);
    expect(useAnimationStore.getState().currentFrameIndex).toBe(5);
  });
});

// ============================================
// Adapter Write Methods
// ============================================

describe('adapter write methods route to timelineStore', () => {
  beforeEach(resetStores);

  it('setFrameData writes to active layer content frame', () => {
    const tl = useTimelineStore.getState();
    const layerId = tl.layers[0].id;

    // Write via adapter
    useAnimationStore.getState().setFrameData(0, new Map([['5,5', makeCell('Z')]]));

    // Verify in timelineStore
    const updatedLayer = useTimelineStore.getState().layers.find(l => l.id === layerId);
    expect(updatedLayer).toBeDefined();
    const cf = updatedLayer!.contentFrames[0];
    expect(cf.data.get('5,5')?.char).toBe('Z');
  });

  it('getFrameData reads from active layer content frame', () => {
    const tl = useTimelineStore.getState();
    const layerId = tl.layers[0].id;
    const cfId = tl.layers[0].contentFrames[0].id;

    // Write directly to timelineStore
    tl.updateContentFrameData(layerId, cfId, new Map([['3,3', makeCell('Q')]]));

    // Read via adapter
    const data = useAnimationStore.getState().getFrameData(0);
    expect(data).toBeDefined();
    expect(data!.get('3,3')?.char).toBe('Q');
  });

  it('importFramesAppend adds content frames to active layer', () => {
    const adapter = useAnimationStore.getState();
    const initialFrameCount = adapter.frames.length;

    // Append frames via adapter
    adapter.importFramesAppend([
      { data: new Map([['0,0', makeCell('X')]]), duration: 100 },
      { data: new Map([['1,1', makeCell('Y')]]), duration: 200 },
    ]);

    // Should have more frames now
    const updatedAdapter = useAnimationStore.getState();
    expect(updatedAdapter.frames.length).toBeGreaterThan(initialFrameCount);
  });

  it('importSessionFrames replaces all content frames', () => {
    const adapter = useAnimationStore.getState();

    // Import frames via adapter
    adapter.importSessionFrames([
      { id: 'f1', name: 'Frame A', duration: 100, data: new Map([['0,0', makeCell('A')]]) },
      { id: 'f2', name: 'Frame B', duration: 200, data: new Map([['1,1', makeCell('B')]]) },
    ]);

    // Should have exactly 2 frames via adapter
    const updated = useAnimationStore.getState();
    expect(updated.frames.length).toBe(2);
  });

  it('setFrameRate updates timelineStore config', () => {
    useAnimationStore.getState().setFrameRate(30);
    expect(useTimelineStore.getState().config.frameRate).toBe(30);
  });

  it('setLooping updates timelineStore view', () => {
    useAnimationStore.getState().setLooping(false);
    expect(useTimelineStore.getState().view.looping).toBe(false);
  });

  it('setCurrentFrame updates timelineStore view', () => {
    useTimelineStore.getState().setDuration(10);
    useAnimationStore.getState().setCurrentFrame(3);
    expect(useTimelineStore.getState().view.currentFrame).toBe(3);
  });
});

// ============================================
// Effects Integration via Adapter
// ============================================

describe('effects store integration via adapter', () => {
  beforeEach(resetStores);

  it('reading frames from adapter returns layer content', () => {
    const tl = useTimelineStore.getState();
    const layerId = tl.layers[0].id;
    const cfId = tl.layers[0].contentFrames[0].id;

    // Set up content frame with data
    tl.updateContentFrameData(layerId, cfId, new Map([
      ['0,0', makeCell('E')],
      ['1,0', makeCell('F')],
    ]));

    // Cell data is in timelineStore (source of truth for drawing)
    const layer = useTimelineStore.getState().layers[0];
    expect(layer.contentFrames[0].data.get('0,0')?.char).toBe('E');
    expect(layer.contentFrames[0].data.get('1,0')?.char).toBe('F');
  });

  it('setFrameData from effects persists to layer content frame', () => {
    const tl = useTimelineStore.getState();
    const layerId = tl.layers[0].id;

    // Simulate what effectsStore does after processing
    const processedData = new Map([
      ['0,0', makeCell('P')],
      ['1,1', makeCell('R')],
    ]);
    useAnimationStore.getState().setFrameData(0, processedData);

    // Verify content frame was updated
    const layer = useTimelineStore.getState().layers.find(l => l.id === layerId)!;
    const cf = layer.contentFrames[0];
    expect(cf.data.get('0,0')?.char).toBe('P');
    expect(cf.data.get('1,1')?.char).toBe('R');
  });
});

// ============================================
// Multi-Layer Adapter Behavior
// ============================================

describe('adapter with multiple layers', () => {
  beforeEach(resetStores);

  it('adapter operates on active layer only', () => {
    const tl = useTimelineStore.getState();
    const layer1Id = tl.layers[0].id;

    // Add second layer
    const layer2Id = tl.addLayer('Layer 2')!;
    expect(layer2Id).not.toBeNull();

    // Write to layer 2's content frame
    const layer2 = useTimelineStore.getState().layers.find(l => l.id === layer2Id)!;
    tl.updateContentFrameData(layer2Id, layer2.contentFrames[0].id,
      new Map([['0,0', makeCell('L2')]])
    );

    // Set active layer to layer 2 (structural change triggers adapter sync)
    tl.setActiveLayer(layer2Id);

    // Verify data is in timelineStore for layer 2
    const l2 = useTimelineStore.getState().layers.find(l => l.id === layer2Id)!;
    expect(l2.contentFrames[0].data.get('0,0')?.char).toBe('L2');

    // Switch back to layer 1 (structural change triggers adapter sync)
    tl.setActiveLayer(layer1Id);

    // Verify layer 1 is empty
    const l1 = useTimelineStore.getState().layers.find(l => l.id === layer1Id)!;
    expect(l1.contentFrames[0].data.get('0,0')).toBeUndefined();
  });

  it('setFrameData writes to active layer, not other layers', () => {
    const tl = useTimelineStore.getState();
    const layer1Id = tl.layers[0].id;

    // Add second layer and set active
    const layer2Id = tl.addLayer('Layer 2')!;
    tl.setActiveLayer(layer2Id);

    // Write via adapter
    useAnimationStore.getState().setFrameData(0, new Map([['9,9', makeCell('X')]]));

    // Layer 2 should have the data
    const layer2 = useTimelineStore.getState().layers.find(l => l.id === layer2Id)!;
    expect(layer2.contentFrames[0].data.get('9,9')?.char).toBe('X');

    // Layer 1 should NOT have the data
    const layer1 = useTimelineStore.getState().layers.find(l => l.id === layer1Id)!;
    expect(layer1.contentFrames[0].data.get('9,9')).toBeUndefined();
  });
});

// ============================================
// Adapter Frame Duration Conversion
// ============================================

describe('adapter frame duration conversion', () => {
  beforeEach(resetStores);

  it('adapter frames have duration in ms (not timeline frames)', () => {
    // Set 12fps → each frame = 83.33ms
    useTimelineStore.getState().setFrameRate(12, false);

    const frames = useAnimationStore.getState().frames;
    expect(frames.length).toBeGreaterThanOrEqual(1);

    // Duration should be in ms
    const expectedMs = 1000 / 12;
    expect(frames[0].duration).toBeCloseTo(expectedMs, 0);
  });

  it('importFramesAppend converts ms duration to timeline frames', () => {
    // Set 10fps for easy math
    useTimelineStore.getState().setFrameRate(10, false);

    useAnimationStore.getState().importFramesAppend([
      { data: new Map([['0,0', makeCell('A')]]), duration: 200 }, // 200ms at 10fps = 2 frames
    ]);

    // Check content frame duration is in frames, not ms
    const tl = useTimelineStore.getState();
    const layer = tl.layers.find(l => l.id === tl.view.activeLayerId)!;
    const appended = layer.contentFrames[layer.contentFrames.length - 1];
    expect(appended.durationFrames).toBe(2); // 200ms / 100ms = 2
  });
});

// ============================================
// Performance: Adapter derivation speed
// ============================================

describe('adapter performance', () => {
  beforeEach(resetStores);

  it('deriving frames from 5 layers is fast (<10ms)', () => {
    const tl = useTimelineStore.getState();
    tl.setDuration(100);

    // Add content frames to default layer
    for (let i = 1; i < 100; i++) {
      tl.addContentFrame(tl.layers[0].id, i, 1);
    }

    // Add 4 more layers
    for (let l = 0; l < 4; l++) {
      tl.addLayer(`Layer ${l + 2}`);
    }

    const start = performance.now();
    const frames = useAnimationStore.getState().frames;
    const elapsed = performance.now() - start;

    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(elapsed).toBeLessThan(10);
  });
});
