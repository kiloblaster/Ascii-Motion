/**
 * Timeline Context Menu — reusable right-click menu for timeline elements.
 *
 * Renders a positioned dropdown-style menu at the mouse position,
 * with items tailored to the clicked element type:
 *  - Content frame: delete, split, copy, paste, hide/show, duplicate
 *  - Empty track: paste, new frame
 *  - Property track: add keyframe, paste keyframe
 *  - Keyframe: delete, copy
 *
 * Uses the same Shadcn dropdown-menu styling for visual consistency.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useTimelineHistory } from '../../../hooks/useTimelineHistory';
import { useToolStore } from '../../../stores/toolStore';
import { cn } from '@/lib/utils';
import {
  Trash2,
  Scissors,
  Copy,
  ClipboardPaste,
  Eye,
  EyeOff,
  CopyPlus,
  Plus,
  Diamond,
  ArrowLeftToLine,
} from 'lucide-react';
import type { LayerId, ContentFrameId, PropertyTrackId, KeyframeId } from '../../../types/timeline';
import { getPropertyValueAtFrame } from '../../../utils/layerCompositing';
import type { ContentFrameReorderHistoryAction } from '../../../types';

// ============================================
// TYPES
// ============================================

export type TimelineContextMenuType =
  | { kind: 'frame'; layerId: LayerId; frameIds: ContentFrameId[]; clickFrame: number }
  | { kind: 'empty-track'; layerId: LayerId; clickFrame: number }
  | { kind: 'property-track'; layerId: LayerId; trackId: PropertyTrackId; clickFrame: number }
  | { kind: 'keyframe'; layerId: LayerId; trackId: PropertyTrackId; keyframeIds: KeyframeId[] };

export interface TimelineContextMenuState {
  x: number;
  y: number;
  context: TimelineContextMenuType;
}

interface Props {
  menu: TimelineContextMenuState;
  onClose: () => void;
}

// ============================================
// MENU ITEM COMPONENT
// ============================================

const MenuItem: React.FC<{
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}> = ({ icon, label, onClick, disabled, destructive }) => (
  <button
    className={cn(
      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
      disabled
        ? 'text-muted-foreground/50 cursor-not-allowed'
        : destructive
          ? 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10'
          : 'hover:bg-accent focus:bg-accent',
    )}
    onClick={(e) => {
      e.stopPropagation();
      if (!disabled) onClick();
    }}
    disabled={disabled}
  >
    {icon}
    {label}
  </button>
);

const MenuSeparator: React.FC = () => <div className="h-px bg-border my-1" />;

// ============================================
// MAIN COMPONENT
// ============================================

export const TimelineContextMenu: React.FC<Props> = ({ menu, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const layers = useTimelineStore((s) => s.layers);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const copiedFrames = useTimelineStore((s) => s.copiedFrames);
  const copiedKeyframes = useTimelineStore((s) => s.copiedKeyframes);
  const selectedContentFrameIds = useTimelineStore((s) => s.view.selectedContentFrameIds);
  const pushToHistory = useToolStore((s) => s.pushToHistory);

  const {
    removeContentFrame,
    splitContentFrame,
    duplicateContentFrame,
    addContentFrame,
    addKeyframe,
    removeKeyframe,
    removeBlankSpace,
  } = useTimelineHistory();

  // Close on click outside or Escape
  useEffect(() => {
    let initialized = false;
    const handleClickOutside = (e: MouseEvent) => {
      if (!initialized) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Use capture phase so we catch events even when stopPropagation is called.
    // Delay initialization by a frame to skip the opening right-click event.
    requestAnimationFrame(() => {
      initialized = true;
    });
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('contextmenu', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('contextmenu', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [onClose]);

  // Auto-position: prevent clipping at window edges
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;
    if (rect.right > window.innerWidth - 8) {
      el.style.left = `${menu.x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight - 8) {
      el.style.top = `${menu.y - rect.height}px`;
    }
  }, [menu.x, menu.y]);

  /** Snapshot all layers' content frames for undo history */
  const snapshotAllLayers = useCallback(() => {
    return useTimelineStore.getState().layers.map((l) => ({
      layerId: l.id as string,
      contentFrames: l.contentFrames.map((cf) => ({
        id: cf.id as string,
        startFrame: cf.startFrame,
        durationFrames: cf.durationFrames,
        name: cf.name,
        data: new Map(cf.data),
      })),
    }));
  }, []);

  /** Paste content frames with undo history */
  const pasteFramesWithHistory = useCallback((layerId: LayerId, atFrame: number) => {
    const before = snapshotAllLayers();
    useTimelineStore.getState().pasteContentFrames(layerId, atFrame);
    const after = snapshotAllLayers();
    const historyAction: ContentFrameReorderHistoryAction = {
      type: 'content_frame_reorder',
      timestamp: Date.now(),
      description: 'Paste content frames',
      data: { previousState: before, newState: after },
    };
    pushToHistory(historyAction);
  }, [snapshotAllLayers, pushToHistory]);

  /** Paste keyframes with undo history */
  const pasteKeyframesWithHistory = useCallback((layerId: LayerId, trackId: PropertyTrackId, atFrame: number) => {
    const copiedKfs = useTimelineStore.getState().copiedKeyframes;
    if (!copiedKfs || copiedKfs.length === 0) return;

    const layers = useTimelineStore.getState().layers;
    const targetLayer = layers.find((l) => l.id === layerId);
    if (!targetLayer) return;
    const targetTrack = targetLayer.propertyTracks.find((t) => t.id === trackId);
    if (!targetTrack) return;

    const copiedPaths = [...new Set(copiedKfs.map((kf) => kf.propertyPath))];
    const targetMatchesCopied = copiedPaths.includes(targetTrack.propertyPath);
    const maxLayerIndex = Math.max(...copiedKfs.map((kf) => kf.layerIndex));
    const isMultiLayer = maxLayerIndex > 0;

    for (const entry of copiedKfs) {
      let destLayerId = layerId;
      let destTrackId = trackId;

      if (isMultiLayer && targetMatchesCopied) {
        // Multi-layer: match original layer IDs, fall back to index offset
        const sourceLayerIds = [...new Set(copiedKfs.map((kf) => kf.sourceLayerId))];
        const allSourceExist = sourceLayerIds.every((id) => layers.some((l) => (l.id as string) === id));

        const destLayer = allSourceExist
          ? layers.find((l) => (l.id as string) === entry.sourceLayerId)
          : (() => {
              const targetLayerIdx = layers.findIndex((l) => l.id === layerId);
              const idx = targetLayerIdx + entry.layerIndex;
              return idx >= 0 && idx < layers.length ? layers[idx] : undefined;
            })();
        if (!destLayer) continue;
        destLayerId = destLayer.id;
        const destTrack = destLayer.propertyTracks.find((t) => t.propertyPath === entry.propertyPath);
        if (!destTrack) continue;
        destTrackId = destTrack.id;
      } else if (targetMatchesCopied) {
        // Single-layer multi-track: route to matching property
        const destTrack = targetLayer.propertyTracks.find((t) => t.propertyPath === entry.propertyPath);
        if (!destTrack) continue;
        destTrackId = destTrack.id;
      } else {
        // Unmatched: only paste trackIndex 0 from layerIndex 0
        if (entry.trackIndex !== 0 || entry.layerIndex !== 0) continue;
      }

      const targetFrame = atFrame + entry.frameOffset;
      const kfId = addKeyframe(destLayerId, destTrackId, targetFrame, entry.value);
      if (kfId) {
        useTimelineStore.getState().updateKeyframe(destLayerId, destTrackId, kfId, { easing: entry.easing });
      }
    }
  }, [addKeyframe]);

  const act = useCallback(
    (fn: () => void) => {
      fn();
      onClose();
    },
    [onClose],
  );

  // ── Render items based on context ──

  const renderItems = () => {
    const ctx = menu.context;

    switch (ctx.kind) {
      case 'frame': {
        const layer = layers.find((l) => l.id === ctx.layerId);
        if (!layer) return null;
        const frameIds = ctx.frameIds;
        const isMulti = frameIds.length > 1;
        const label = isMulti ? 'frames' : 'frame';

        // Determine hide/show state from last selected frame
        const lastCf = layer.contentFrames.find((cf) => cf.id === frameIds[frameIds.length - 1]);
        const allHidden = lastCf?.hidden ?? false;

        // Can split? Only if single frame and playhead is inside it
        const canSplit = frameIds.length === 1 && (() => {
          const cf = layer.contentFrames.find((c) => c.id === frameIds[0]);
          return cf ? currentFrame > cf.startFrame && currentFrame < cf.startFrame + cf.durationFrames : false;
        })();

        return (
          <>
            <MenuItem
              icon={<Copy className="w-4 h-4" />}
              label={`Copy ${label}`}
              onClick={() => act(() => {
                useTimelineStore.getState().copyContentFrames(ctx.layerId, frameIds);
              })}
            />
            <MenuItem
              icon={<ClipboardPaste className="w-4 h-4" />}
              label="Paste at playhead"
              onClick={() => act(() => {
                pasteFramesWithHistory(ctx.layerId, currentFrame);
              })}
              disabled={!copiedFrames}
            />
            <MenuItem
              icon={<ClipboardPaste className="w-4 h-4" />}
              label="Paste frame here"
              onClick={() => act(() => {
                pasteFramesWithHistory(ctx.layerId, ctx.clickFrame);
              })}
              disabled={!copiedFrames}
            />
            <MenuItem
              icon={<CopyPlus className="w-4 h-4" />}
              label={`Duplicate ${label}`}
              onClick={() => act(() => {
                for (const fid of frameIds) {
                  duplicateContentFrame(ctx.layerId, fid);
                }
              })}
            />
            <MenuSeparator />
            <MenuItem
              icon={<Scissors className="w-4 h-4" />}
              label="Split at playhead"
              onClick={() => act(() => {
                splitContentFrame(ctx.layerId, frameIds[0], currentFrame);
              })}
              disabled={!canSplit}
            />
            <MenuItem
              icon={allHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              label={allHidden ? `Show ${label}` : `Hide ${label}`}
              onClick={() => act(() => {
                useTimelineStore.getState().toggleContentFrameHidden(ctx.layerId, frameIds, !allHidden);
              })}
            />
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 className="w-4 h-4" />}
              label={`Delete ${label}`}
              onClick={() => act(() => {
                for (const fid of frameIds) {
                  removeContentFrame(ctx.layerId, fid);
                }
                useTimelineStore.getState().clearContentFrameSelection();
              })}
              destructive
            />
          </>
        );
      }

      case 'empty-track': {
        return (
          <>
            <MenuItem
              icon={<Plus className="w-4 h-4" />}
              label="New frame here"
              onClick={() => act(() => {
                addContentFrame(ctx.layerId, ctx.clickFrame, 1);
              })}
            />
            <MenuItem
              icon={<ClipboardPaste className="w-4 h-4" />}
              label="Paste frame at playhead"
              onClick={() => act(() => {
                pasteFramesWithHistory(ctx.layerId, currentFrame);
              })}
              disabled={!copiedFrames}
            />
            <MenuSeparator />
            <MenuItem
              icon={<ArrowLeftToLine className="w-4 h-4" />}
              label="Remove blank space"
              onClick={() => act(() => {
                removeBlankSpace(ctx.layerId, ctx.clickFrame);
              })}
            />
          </>
        );
      }

      case 'property-track': {
        return (
          <>
            <MenuItem
              icon={<Diamond className="w-4 h-4" />}
              label="Add keyframe here"
              onClick={() => act(() => {
                const layer = layers.find((l) => l.id === ctx.layerId);
                if (!layer) return;
                const track = layer.propertyTracks.find((t) => t.id === ctx.trackId);
                if (!track) return;
                const currentValue = getPropertyValueAtFrame(layer, track.propertyPath, ctx.clickFrame);
                addKeyframe(ctx.layerId, ctx.trackId, ctx.clickFrame, currentValue);
              })}
            />
            <MenuItem
              icon={<ClipboardPaste className="w-4 h-4" />}
              label="Paste keyframe here"
              onClick={() => act(() => {
                pasteKeyframesWithHistory(ctx.layerId, ctx.trackId, ctx.clickFrame);
              })}
              disabled={!copiedKeyframes}
            />
          </>
        );
      }

      case 'keyframe': {
        const isMulti = ctx.keyframeIds.length > 1;
        const label = isMulti ? 'keyframes' : 'keyframe';

        return (
          <>
            <MenuItem
              icon={<Copy className="w-4 h-4" />}
              label={`Copy ${label}`}
              onClick={() => act(() => {
                useTimelineStore.getState().copyKeyframes(ctx.keyframeIds);
              })}
            />
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 className="w-4 h-4" />}
              label={`Delete ${label}`}
              onClick={() => act(() => {
                for (const kfId of ctx.keyframeIds) {
                  removeKeyframe(ctx.layerId, ctx.trackId, kfId);
                }
                useTimelineStore.getState().clearKeyframeSelection();
              })}
              destructive
            />
          </>
        );
      }
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[99999] min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {renderItems()}
    </div>,
    document.body,
  );
};
