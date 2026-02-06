/**
 * Session Migration Tests
 * 
 * Tests for src/utils/sessionMigration.ts
 * Covers: version detection, v1→v2 migration, validation & repair
 */

import { describe, it, expect } from 'vitest';
import {
  detectSessionVersion,
  migrateV1ToV2,
  validateAndRepairV2,
} from '../utils/sessionMigration';
import type { SessionDataV2 } from '../types/timeline';

// ============================================
// Fixtures
// ============================================

function makeV1Session(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    version: '1.0.0',
    name: 'Test Project',
    canvas: {
      width: 80,
      height: 24,
      canvasBackgroundColor: '#1a1a2e',
      showGrid: true,
    },
    animation: {
      frames: [
        {
          id: 'f1',
          name: 'Frame 1',
          duration: 100,
          data: { '0,0': { char: 'H', color: '#fff', bgColor: '#000' } },
        },
        {
          id: 'f2',
          name: 'Frame 2',
          duration: 200,
          data: { '1,0': { char: 'i', color: '#fff', bgColor: '#000' } },
        },
      ],
      frameRate: 12,
      looping: true,
    },
    ...overrides,
  };
}

function makeV2Session(overrides?: Partial<SessionDataV2>): SessionDataV2 {
  return {
    version: '2.0.0',
    canvas: {
      width: 80,
      height: 24,
      canvasBackgroundColor: '#1a1a2e',
      showGrid: true,
    },
    timeline: {
      frameRate: 12,
      durationFrames: 10,
      looping: true,
    },
    layers: [
      {
        id: 'layer-1',
        name: 'Layer 1',
        visible: true,
        solo: false,
        locked: false,
        opacity: 100,
        contentFrames: [
          {
            id: 'cf-1',
            name: 'Frame 1',
            startFrame: 0,
            durationFrames: 5,
            data: {},
          },
          {
            id: 'cf-2',
            name: 'Frame 2',
            startFrame: 5,
            durationFrames: 5,
            data: {},
          },
        ],
        propertyTracks: [],
      },
    ],
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================

describe('detectSessionVersion', () => {
  it('detects v1 from animation.frames', () => {
    expect(detectSessionVersion(makeV1Session())).toBe('1.0.0');
  });

  it('detects v2 from version field and layers', () => {
    expect(detectSessionVersion(makeV2Session())).toBe('2.0.0');
  });

  it('returns unknown for null', () => {
    expect(detectSessionVersion(null)).toBe('unknown');
  });

  it('returns unknown for empty object', () => {
    expect(detectSessionVersion({})).toBe('unknown');
  });

  it('returns unknown for non-object', () => {
    expect(detectSessionVersion('test')).toBe('unknown');
    expect(detectSessionVersion(42)).toBe('unknown');
  });

  it('returns unknown for object without animation or layers', () => {
    expect(detectSessionVersion({ version: '1.0.0' })).toBe('unknown');
  });
});

describe('migrateV1ToV2', () => {
  it('produces version 2.0.0', () => {
    const result = migrateV1ToV2(makeV1Session());
    expect(result.version).toBe('2.0.0');
  });

  it('creates exactly one layer', () => {
    const result = migrateV1ToV2(makeV1Session());
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].name).toBe('Layer 1');
  });

  it('converts v1 frames to content frames', () => {
    const result = migrateV1ToV2(makeV1Session());
    const layer = result.layers[0];
    expect(layer.contentFrames).toHaveLength(2);
  });

  it('preserves frame IDs', () => {
    const result = migrateV1ToV2(makeV1Session());
    const frames = result.layers[0].contentFrames;
    expect(frames[0].id).toBe('f1');
    expect(frames[1].id).toBe('f2');
  });

  it('converts duration from ms to frame counts', () => {
    // At 12fps: 100ms ≈ 1.2 frames → rounds to 1
    // At 12fps: 200ms ≈ 2.4 frames → rounds to 2
    const result = migrateV1ToV2(makeV1Session());
    const frames = result.layers[0].contentFrames;
    expect(frames[0].durationFrames).toBe(1);
    expect(frames[1].durationFrames).toBe(2);
  });

  it('places frames sequentially', () => {
    const result = migrateV1ToV2(makeV1Session());
    const frames = result.layers[0].contentFrames;
    expect(frames[0].startFrame).toBe(0);
    expect(frames[1].startFrame).toBe(1); // After first frame (duration=1)
  });

  it('preserves frame rate', () => {
    const result = migrateV1ToV2(makeV1Session());
    expect(result.timeline.frameRate).toBe(12);
  });

  it('preserves looping setting', () => {
    const result = migrateV1ToV2(makeV1Session());
    expect(result.timeline.looping).toBe(true);
  });

  it('preserves canvas settings', () => {
    const result = migrateV1ToV2(makeV1Session());
    expect(result.canvas.width).toBe(80);
    expect(result.canvas.height).toBe(24);
  });

  it('preserves frame data', () => {
    const result = migrateV1ToV2(makeV1Session());
    const data = result.layers[0].contentFrames[0].data;
    expect(data['0,0']).toEqual({ char: 'H', color: '#fff', bgColor: '#000' });
  });

  it('uses defaults when frameRate is missing', () => {
    const v1 = makeV1Session();
    (v1.animation as Record<string, unknown>).frameRate = undefined;
    const result = migrateV1ToV2(v1);
    expect(result.timeline.frameRate).toBe(12);
  });

  it('handles empty animation frames', () => {
    const v1 = makeV1Session();
    (v1.animation as Record<string, unknown>).frames = [];
    const result = migrateV1ToV2(v1);
    expect(result.layers[0].contentFrames).toHaveLength(0);
    // Duration should fall back to frameRate (1 second)
    expect(result.timeline.durationFrames).toBe(12);
  });

  it('handles missing frame duration', () => {
    const v1 = makeV1Session();
    const frames = ((v1.animation as Record<string, unknown>).frames as Array<Record<string, unknown>>);
    delete frames[0].duration;
    const result = migrateV1ToV2(v1);
    // Should use default 100ms → 1 frame at 12fps
    expect(result.layers[0].contentFrames[0].durationFrames).toBe(1);
  });

  it('passes through tool settings', () => {
    const v1 = makeV1Session({ tools: { pencil: { size: 3 } } });
    const result = migrateV1ToV2(v1);
    expect(result.tools).toEqual({ pencil: { size: 3 } });
  });
});

describe('validateAndRepairV2', () => {
  it('returns clean data with no repairs', () => {
    const v2 = makeV2Session();
    const { data, repairs } = validateAndRepairV2(v2);
    expect(repairs).toHaveLength(0);
    expect(data.layers).toHaveLength(1);
  });

  it('repairs negative startFrame', () => {
    const v2 = makeV2Session();
    v2.layers[0].contentFrames[0].startFrame = -5;
    v2.layers[0].contentFrames[1].startFrame = 10; // Move to avoid overlap with fix

    const { data, repairs } = validateAndRepairV2(v2);
    expect(repairs.length).toBeGreaterThan(0);
    expect(repairs.some((r) => r.includes('negative startFrame'))).toBe(true);
    expect(data.layers[0].contentFrames[0].startFrame).toBe(0);
  });

  it('repairs durationFrames < 1', () => {
    const v2 = makeV2Session();
    v2.layers[0].contentFrames[0].durationFrames = 0;

    const { data, repairs } = validateAndRepairV2(v2);
    expect(repairs.some((r) => r.includes('durationFrames'))).toBe(true);
    expect(data.layers[0].contentFrames[0].durationFrames).toBe(1);
  });

  it('repairs overlapping content frames', () => {
    const v2 = makeV2Session();
    // Make both frames start at 0 to create overlap
    v2.layers[0].contentFrames[0].startFrame = 0;
    v2.layers[0].contentFrames[0].durationFrames = 5;
    v2.layers[0].contentFrames[1].startFrame = 3; // Overlaps with [0,5)

    const { data, repairs } = validateAndRepairV2(v2);
    expect(repairs.some((r) => r.includes('overlap'))).toBe(true);
    // Second frame should be shifted to start at 5
    expect(data.layers[0].contentFrames[1].startFrame).toBe(5);
  });

  it('repairs missing data field', () => {
    const v2 = makeV2Session();
    (v2.layers[0].contentFrames[0] as Record<string, unknown>).data = null;

    const { data, repairs } = validateAndRepairV2(v2);
    expect(repairs.some((r) => r.includes('missing data'))).toBe(true);
    expect(data.layers[0].contentFrames[0].data).toEqual({});
  });

  it('sorts content frames by startFrame', () => {
    const v2 = makeV2Session();
    // Reverse the order  
    v2.layers[0].contentFrames = [
      v2.layers[0].contentFrames[1], // startFrame 5
      v2.layers[0].contentFrames[0], // startFrame 0
    ];

    const { data } = validateAndRepairV2(v2);
    expect(data.layers[0].contentFrames[0].startFrame).toBe(0);
    expect(data.layers[0].contentFrames[1].startFrame).toBe(5);
  });
});
