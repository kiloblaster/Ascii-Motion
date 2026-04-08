/**
 * usePostEffectBlockHistory — helpers for recording post effect undo/redo history.
 *
 * Follows the same pattern as useEffectBlockHistory but for the post effects system.
 */

import { useCallback } from 'react';
import { useToolStore } from '../stores/toolStore';
import { useTimelineStore } from '../stores/timelineStore';
import type { PostEffectTrack, PostEffectBlock, PostEffectBlockId } from '../types/postEffect';

/** Find the post effect track by blockId */
function findPostEffectTrackByBlockId(
  blockId: PostEffectBlockId,
): { track: PostEffectTrack; index: number } | null {
  const state = useTimelineStore.getState();
  const index = state.postEffectTracks.findIndex(
    (t) => t.effectBlock.id === blockId,
  );
  if (index < 0) return null;
  return { track: state.postEffectTracks[index], index };
}

export function usePostEffectBlockHistory() {
  const pushToHistory = useToolStore((s) => s.pushToHistory);

  /** Record history after adding a post effect block */
  const recordAdd = useCallback(
    (blockId: PostEffectBlockId) => {
      const found = findPostEffectTrackByBlockId(blockId);
      if (!found) return;
      pushToHistory({
        type: 'post_effect_block_add',
        timestamp: Date.now(),
        description: `Add ${found.track.effectBlock.postEffectType} post effect`,
        data: {
          trackSnapshot: structuredClone(found.track),
        },
      });
    },
    [pushToHistory],
  );

  /** Record history before removing a post effect block */
  const recordRemove = useCallback(
    (blockId: PostEffectBlockId) => {
      const found = findPostEffectTrackByBlockId(blockId);
      if (!found) return;
      pushToHistory({
        type: 'post_effect_block_remove',
        timestamp: Date.now(),
        description: `Remove ${found.track.effectBlock.postEffectType} post effect`,
        data: {
          trackSnapshot: structuredClone(found.track),
          trackIndex: found.index,
        },
      });
    },
    [pushToHistory],
  );

  /** Record history for a post effect block update */
  const recordUpdate = useCallback(
    (blockId: PostEffectBlockId, previousBlock: PostEffectBlock) => {
      const found = findPostEffectTrackByBlockId(blockId);
      if (!found) return;
      pushToHistory({
        type: 'post_effect_block_update',
        timestamp: Date.now(),
        description: `Update ${found.track.effectBlock.postEffectType} post effect`,
        data: {
          blockId: blockId as string,
          previousBlock: structuredClone(previousBlock),
          newBlock: structuredClone(found.track.effectBlock),
        },
      });
    },
    [pushToHistory],
  );

  return { recordAdd, recordRemove, recordUpdate, findPostEffectTrackByBlockId };
}
