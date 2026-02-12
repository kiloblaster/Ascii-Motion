/**
 * Timeline Track Area — the scrollable area showing content frame blocks
 * and keyframe diamonds for each layer.
 * 
 * Horizontally scrollable, synced with the timeline ruler.
 * Each layer gets a row; expanded layers show property track sub-rows.
 * 
 * Part of the Layer Timeline Refactor (Phase 3)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §3.8, §3.9
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useTimelineHistory } from '../../../hooks/useTimelineHistory';
import { getPropertyValueAtFrame } from '../../../utils/layerCompositing';
import { ContentFrameBlock } from './ContentFrameBlock';
import { KeyframeDiamond } from './KeyframeDiamond';
import { PROPERTY_DEFINITIONS, PROPERTY_DISPLAY_ORDER } from '../../../types/timeline';
import { usePlaybackOnlySnapshot } from '../../../hooks/usePlaybackOnlySnapshot';
import { TimelineContextMenu, type TimelineContextMenuState } from './TimelineContextMenu';
import type { KeyframeId } from '../../../types/timeline';
import { cn } from '@/lib/utils';

/** Pixels per frame at zoom=1 */
const BASE_PX_PER_FRAME = 12;

interface TimelineTrackAreaProps {
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const TimelineTrackArea: React.FC<TimelineTrackAreaProps> = ({ scrollRef }) => {
  const layers = useTimelineStore((s) => s.layers);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const zoom = useTimelineStore((s) => s.view.zoom);
  const scrollX = useTimelineStore((s) => s.view.scrollX);
  const setScrollX = useTimelineStore((s) => s.setScrollX);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const selectedKeyframeIds = useTimelineStore((s) => s.view.selectedKeyframeIds);
  const expandedLayerIds = useTimelineStore((s) => s.view.expandedLayerIds);
  const selectKeyframes = useTimelineStore((s) => s.selectKeyframes);
  const clearContentFrameSelection = useTimelineStore((s) => s.clearContentFrameSelection);
  const clearKeyframeSelection = useTimelineStore((s) => s.clearKeyframeSelection);
  const contentFrameDragPreview = useTimelineStore((s) => s.view.contentFrameDragPreview);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const { addKeyframe } = useTimelineHistory();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<TimelineContextMenuState | null>(null);

  // Playback position for live indicator
  const { isActive: isPlaybackActive, currentFrameIndex: playbackFrame } = usePlaybackOnlySnapshot();

  // Marquee selection state
  const [marquee, setMarquee] = useState<{
    startX: number; startY: number; currentX: number; currentY: number;
  } | null>(null);
  const marqueeRef = useRef<typeof marquee>(null);

  const internalRef = useRef<HTMLDivElement>(null);
  // Merge scrollRef (from parent for sync) with internal ref (for wheel zoom)
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    internalRef.current = node;
    if (scrollRef && 'current' in scrollRef) {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }, [scrollRef]);
  const pxPerFrame = BASE_PX_PER_FRAME * zoom;
  const totalWidth = durationFrames * pxPerFrame;

  // Display reversed to match layer list (top = top z-order)
  const displayLayers = [...layers].reverse();

  // Horizontal scroll handling
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollX(e.currentTarget.scrollLeft);
    },
    [setScrollX],
  );

  // Zoom with scroll wheel (Ctrl/Cmd + scroll)
  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(zoom + delta);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [zoom, setZoom]);

  // ── Marquee selection + click-to-deselect ──

  /**
   * Compute which keyframes fall inside a pixel rectangle (relative to scroll container content).
   * Each property track row is 24px high. We compute the vertical offsets dynamically
   * based on the layer/track layout.
   */
  const getKeyframesInRect = useCallback(
    (x1: number, y1: number, x2: number, y2: number): KeyframeId[] => {
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);

      const CONTENT_ROW_H = 32; // content frame row height
      const TRACK_ROW_H = 24;   // property track row height
      const ADD_PROP_ROW_H = 24; // "+ Add Property" spacer

      const result: KeyframeId[] = [];
      let yOffset = 0;

      for (const layer of displayLayers) {
        // Content frame row
        yOffset += CONTENT_ROW_H;

        // Property track rows (only when expanded)
        if (expandedLayerIds.has(layer.id)) {
          for (const track of layer.propertyTracks) {
            const trackTop = yOffset;
            const trackBottom = yOffset + TRACK_ROW_H;

            // Check each keyframe on this track
            for (const kf of track.keyframes) {
              const kfX = kf.frame * pxPerFrame;
              // Keyframe diamond is ~12px, centered at kfX
              if (kfX >= left - 6 && kfX <= right + 6 && trackBottom > top && trackTop < bottom) {
                result.push(kf.id);
              }
            }

            yOffset += TRACK_ROW_H;
          }
          // Add Property spacer
          yOffset += ADD_PROP_ROW_H;
        }
      }

      return result;
    },
    [displayLayers, expandedLayerIds, pxPerFrame],
  );

  const handleTrackAreaMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left button clicks on the background (not on diamonds or content frames)
      if (e.button !== 0) return;
      clearContentFrameSelection();

      const el = internalRef.current;
      if (!el) return;

      // Get position relative to the scrollable content
      const rect = el.getBoundingClientRect();
      const startX = e.clientX - rect.left + el.scrollLeft;
      const startY = e.clientY - rect.top + el.scrollTop;

      let didDrag = false;
      const DRAG_THRESHOLD = 4;

      const onMouseMove = (me: MouseEvent) => {
        const dx = me.clientX - e.clientX;
        const dy = me.clientY - e.clientY;
        if (!didDrag && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
        didDrag = true;

        const currentX = me.clientX - rect.left + el.scrollLeft;
        const currentY = me.clientY - rect.top + el.scrollTop;

        const m = { startX, startY, currentX, currentY };
        marqueeRef.current = m;
        setMarquee(m);

        // Live-update selection as marquee changes
        const kfIds = getKeyframesInRect(startX, startY, currentX, currentY);
        useTimelineStore.getState().selectKeyframes(kfIds);
        if (kfIds.length > 0) {
          useTimelineStore.getState().setEditingKeyframe(kfIds[kfIds.length - 1]);
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        marqueeRef.current = null;
        setMarquee(null);

        if (!didDrag) {
          // Click on blank space with no drag → deselect all keyframes + close editor
          clearKeyframeSelection();
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [clearContentFrameSelection, clearKeyframeSelection, getKeyframesInRect],
  );

  return (
    <div
      ref={setRefs}
      className="flex-1 overflow-x-auto overflow-y-auto"
      onScroll={handleScroll}
      onMouseDown={handleTrackAreaMouseDown}
    >
      <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
        {displayLayers.map((layer) => (
          <div key={layer.id} data-layer-id={layer.id}>
            {/* Layer content frame row */}
            <div
              className={cn(
                'relative border-b border-border/50 min-h-[32px]',
                layer.id === activeLayerId && 'bg-accent/20',
              )}
              onContextMenu={(e) => {
                // Only trigger if clicking on empty space (not on a content frame)
                if ((e.target as HTMLElement).closest('[data-content-frame]')) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left + (internalRef.current?.scrollLeft ?? 0);
                const clickFrame = Math.max(0, Math.round(clickX / pxPerFrame));
                setContextMenu({ x: e.clientX, y: e.clientY, context: { kind: 'empty-track', layerId: layer.id, clickFrame } });
              }}
            >
              {/* Content frame blocks */}
              {layer.contentFrames.map((cf) => (
                <ContentFrameBlock
                  key={cf.id}
                  layerId={layer.id}
                  contentFrame={cf}
                  pxPerFrame={pxPerFrame}
                  scrollX={scrollX}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // If this frame is selected, use all selected frames; otherwise just this one
                    const selectedIds = useTimelineStore.getState().view.selectedContentFrameIds;
                    const frameIds = selectedIds.has(cf.id) && selectedIds.size > 0
                      ? [...selectedIds]
                      : [cf.id];
                    // Calculate the frame position where the user right-clicked
                    const trackEl = e.currentTarget.parentElement;
                    const rect = trackEl?.getBoundingClientRect();
                    const clickX = rect ? e.clientX - rect.left + (internalRef.current?.scrollLeft ?? 0) : 0;
                    const clickFrame = Math.max(0, Math.round(clickX / pxPerFrame));
                    setContextMenu({ x: e.clientX, y: e.clientY, context: { kind: 'frame', layerId: layer.id, frameIds, clickFrame } });
                  }}
                />
              ))}

              {/* Keyframe dots on collapsed layers */}
              {!expandedLayerIds.has(layer.id) && layer.propertyTracks.length > 0 && (() => {
                // Collect unique frame positions across all property tracks
                const kfFrames = new Set<number>();
                for (const track of layer.propertyTracks) {
                  for (const kf of track.keyframes) {
                    kfFrames.add(kf.frame);
                  }
                }
                return [...kfFrames].map((frame) => (
                  <div
                    key={`kf-dot-${frame}`}
                    className="absolute w-[6px] h-[6px] rounded-full bg-yellow-500/80 pointer-events-none z-10"
                    style={{
                      left: frame * pxPerFrame - 3,
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                ));
              })()}

              {/* Ghost + drop indicator — only on the target layer */}
              {contentFrameDragPreview && contentFrameDragPreview.targetLayerId === layer.id && (
                <>
                  {/* Drop indicator line */}
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-purple-500 pointer-events-none z-20"
                    style={{ left: contentFrameDragPreview.slotFrame * pxPerFrame - 1 }}
                  >
                    <div className="absolute -top-1 -left-[4px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-purple-500" />
                    <div className="absolute -bottom-1 -left-[4px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[6px] border-b-purple-500" />
                  </div>
                  {/* Ghost with individual frame dividers */}
                  <div
                    className="absolute top-1 h-[24px] rounded border border-purple-500/60 bg-purple-500/20 pointer-events-none z-30 overflow-hidden"
                    style={{
                      left: contentFrameDragPreview.ghostLeftPx,
                      width: contentFrameDragPreview.ghostWidthPx,
                    }}
                  >
                    {/* Render dividing lines for each selected frame within the ghost */}
                    {(() => {
                      const selectedIds = useTimelineStore.getState().view.selectedContentFrameIds;
                      if (selectedIds.size <= 1) return null;
                      const sourceLayer = layers.find((l) => l.id === contentFrameDragPreview.sourceLayerId);
                      if (!sourceLayer) return null;
                      const selectedFrames = sourceLayer.contentFrames
                        .filter((cf) => selectedIds.has(cf.id))
                        .sort((a, b) => a.startFrame - b.startFrame);
                      if (selectedFrames.length <= 1) return null;
                      const firstStart = selectedFrames[0].startFrame;
                      // Render a divider at each frame boundary (start and end of each frame relative to group start)
                      const dividers: React.ReactNode[] = [];
                      for (let i = 0; i < selectedFrames.length; i++) {
                        const cf = selectedFrames[i];
                        const frameStartPx = (cf.startFrame - firstStart) * pxPerFrame;
                        const frameEndPx = (cf.startFrame + cf.durationFrames - firstStart) * pxPerFrame;
                        // Left edge divider (skip first frame's left edge — that's the ghost border)
                        if (i > 0) {
                          dividers.push(
                            <div
                              key={`start-${i}`}
                              className="absolute top-0 bottom-0 w-[1px] bg-purple-500/50"
                              style={{ left: frameStartPx }}
                            />
                          );
                        }
                        // Right edge divider (skip last frame's right edge — that's the ghost border)
                        if (i < selectedFrames.length - 1) {
                          dividers.push(
                            <div
                              key={`end-${i}`}
                              className="absolute top-0 bottom-0 w-[1px] bg-purple-500/50"
                              style={{ left: frameEndPx }}
                            />
                          );
                        }
                      }
                      return dividers;
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* Property track rows (only when layer is expanded) */}
            {expandedLayerIds.has(layer.id) && [...layer.propertyTracks]
              .sort((a, b) => {
                const idxA = PROPERTY_DISPLAY_ORDER.indexOf(a.propertyPath);
                const idxB = PROPERTY_DISPLAY_ORDER.indexOf(b.propertyPath);
                return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
              })
              .map((track) => {
              const definition = PROPERTY_DEFINITIONS[track.propertyPath];
              const defaultValue = (definition?.defaultValue as number) ?? 0;

              const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const frame = Math.round(clickX / pxPerFrame);
                if (frame >= 0) {
                  const currentValue = getPropertyValueAtFrame(layer, track.propertyPath, frame);
                  const kfId = addKeyframe(layer.id, track.id, frame, currentValue);
                  if (kfId) {
                    selectKeyframes([kfId]);
                    setEditingKeyframe(kfId);
                  }
                }
              };

              return (
                <div
                  key={track.id}
                  className="relative border-b border-border/30 min-h-[24px] bg-muted/10 cursor-crosshair"
                  onDoubleClick={handleTrackClick}
                  onContextMenu={(e) => {
                    // Only trigger if clicking on empty space (not on a keyframe)
                    if ((e.target as HTMLElement).closest('[data-keyframe]')) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left + (internalRef.current?.scrollLeft ?? 0);
                    const clickFrame = Math.max(0, Math.round(clickX / pxPerFrame));
                    setContextMenu({ x: e.clientX, y: e.clientY, context: { kind: 'property-track', layerId: layer.id, trackId: track.id, clickFrame } });
                  }}
                >
                  {/* Keyframe diamonds */}
                  {track.keyframes.map((kf) => (
                    <KeyframeDiamond
                      key={kf.id}
                      layerId={layer.id}
                      trackId={track.id}
                      keyframe={kf}
                      pxPerFrame={pxPerFrame}
                      scrollX={scrollX}
                      isSelected={selectedKeyframeIds.has(kf.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const selKfIds = useTimelineStore.getState().view.selectedKeyframeIds;
                        const kfIds = selKfIds.has(kf.id) && selKfIds.size > 0
                          ? [...selKfIds]
                          : [kf.id];
                        setContextMenu({ x: e.clientX, y: e.clientY, context: { kind: 'keyframe', layerId: layer.id, trackId: track.id, keyframeIds: kfIds } });
                      }}
                    />
                  ))}
                </div>
              );
            })}

            {/* Spacer row matching the "+ Add Property" button row */}
            {expandedLayerIds.has(layer.id) && (
              <div className="min-h-[24px] border-b border-border/30 bg-muted/5" />
            )}
          </div>
        ))}

        {/* Marquee selection rectangle */}
        {marquee && (
          <div
            className="absolute border border-blue-400/70 bg-blue-400/15 pointer-events-none z-30"
            style={{
              left: Math.min(marquee.startX, marquee.currentX),
              top: Math.min(marquee.startY, marquee.currentY),
              width: Math.abs(marquee.currentX - marquee.startX),
              height: Math.abs(marquee.currentY - marquee.startY),
            }}
          />
        )}

        {/* Playhead line spanning all rows */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500/50 pointer-events-none z-10"
          style={{ left: currentFrame * pxPerFrame }}
        />

        {/* Playback position line (moves during playback) */}
        {isPlaybackActive && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-400/50 pointer-events-none z-10"
            style={{ left: playbackFrame * pxPerFrame }}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <TimelineContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
};
