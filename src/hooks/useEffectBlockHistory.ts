/**
 * useEffectBlockHistory — helpers for recording effect-related undo/redo history.
 */

import { useCallback } from 'react';
import { useToolStore } from '../stores/toolStore';
import { useTimelineStore } from '../stores/timelineStore';
import type { EffectTrack, EffectBlock, EffectBlockId } from '../types/effectBlock';
import type { LayerId, LayerGroupId } from '../types/timeline';
import type {
  EffectBlockAddHistoryAction,
  EffectBlockRemoveHistoryAction,
  EffectBlockUpdateHistoryAction,
} from '../types';

type OwnerId = LayerId | LayerGroupId | null;

function getOwnerType(ownerId: OwnerId): 'layer' | 'group' | 'global' {
  if (ownerId === null) return 'global';
  if ((ownerId as string).startsWith('group-')) return 'group';
  return 'layer';
}

/** Find the effect track by blockId across all owners */
function findTrackByBlockId(blockId: EffectBlockId): { track: EffectTrack; ownerId: OwnerId } | null {
  const state = useTimelineStore.getState();
  for (const layer of state.layers) {
    for (const track of (layer.effectTracks ?? [])) {
      if (track.effectBlock.id === blockId) return { track, ownerId: layer.id };
    }
  }
  for (const group of state.layerGroups) {
    for (const track of (group.effectTracks ?? [])) {
      if (track.effectBlock.id === blockId) return { track, ownerId: group.id };
    }
  }
  for (const track of state.globalEffects) {
    if (track.effectBlock.id === blockId) return { track, ownerId: null };
  }
  return null;
}

export function useEffectBlockHistory() {
  const pushToHistory = useToolStore((s) => s.pushToHistory);

  /** Record history after adding an effect block */
  const recordAdd = useCallback((ownerId: OwnerId, blockId: EffectBlockId) => {
    const found = findTrackByBlockId(blockId);
    if (!found) return;
    pushToHistory({
      type: 'effect_block_add',
      timestamp: Date.now(),
      description: `Add ${found.track.effectBlock.effectType} effect`,
      data: {
        ownerId: ownerId as string | null,
        ownerType: getOwnerType(ownerId),
        trackSnapshot: structuredClone(found.track),
      },
    } as EffectBlockAddHistoryAction);
  }, [pushToHistory]);

  /** Record history before removing an effect block */
  const recordRemove = useCallback((ownerId: OwnerId, blockId: EffectBlockId) => {
    const found = findTrackByBlockId(blockId);
    if (!found) return;
    // Find index
    let trackIndex = 0;
    const state = useTimelineStore.getState();
    if (ownerId === null) {
      trackIndex = state.globalEffects.findIndex((t) => t.effectBlock.id === blockId);
    } else {
      const layer = state.layers.find((l) => l.id === ownerId);
      if (layer) trackIndex = (layer.effectTracks ?? []).findIndex((t) => t.effectBlock.id === blockId);
      else {
        const group = state.layerGroups.find((g) => g.id === ownerId);
        if (group) trackIndex = (group.effectTracks ?? []).findIndex((t) => t.effectBlock.id === blockId);
      }
    }
    pushToHistory({
      type: 'effect_block_remove',
      timestamp: Date.now(),
      description: `Remove ${found.track.effectBlock.effectType} effect`,
      data: {
        ownerId: ownerId as string | null,
        ownerType: getOwnerType(ownerId),
        trackSnapshot: structuredClone(found.track),
        trackIndex,
      },
    } as EffectBlockRemoveHistoryAction);
  }, [pushToHistory]);

  /** Record history for an effect block update (timing, settings, enabled) */
  const recordUpdate = useCallback((blockId: EffectBlockId, previousBlock: EffectBlock) => {
    const found = findTrackByBlockId(blockId);
    if (!found) return;
    const ownerId = found.ownerId;
    pushToHistory({
      type: 'effect_block_update',
      timestamp: Date.now(),
      description: `Update ${found.track.effectBlock.effectType} effect`,
      data: {
        ownerId: ownerId as string | null,
        ownerType: getOwnerType(ownerId),
        blockId: blockId as string,
        previousBlock: structuredClone(previousBlock),
        newBlock: structuredClone(found.track.effectBlock),
      },
    } as EffectBlockUpdateHistoryAction);
  }, [pushToHistory]);

  return { recordAdd, recordRemove, recordUpdate, findTrackByBlockId };
}
