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
import { getPropertyValueAtFrame, getGroupPropertyValue } from '../../../utils/layerCompositing';
import { ContentFrameBlock } from './ContentFrameBlock';
import { KeyframeDiamond } from './KeyframeDiamond';
import { EffectBlockComponent } from './EffectBlock';
import { PROPERTY_DISPLAY_ORDER, generateKeyframeId } from '../../../types/timeline';
import { defaultEasing } from '../../../types/easing';
import { usePlaybackOnlySnapshot } from '../../../hooks/usePlaybackOnlySnapshot';
import { Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { TimelineContextMenu, type TimelineContextMenuState } from './TimelineContextMenu';
import type { KeyframeId, ContentFrameId, LayerId } from '../../../types/timeline';
import { cn } from '@/lib/utils';

/** Pixels per frame at zoom=1 */
const BASE_PX_PER_FRAME = 12;

interface TimelineTrackAreaProps {
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const TimelineTrackArea: React.FC<TimelineTrackAreaProps> = ({ scrollRef }) => {
  const layers = useTimelineStore((s) => s.layers);
  const layerGroups = useTimelineStore((s) => s.layerGroups);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const zoom = useTimelineStore((s) => s.view.zoom);
  const scrollX = useTimelineStore((s) => s.view.scrollX);
  const setScrollX = useTimelineStore((s) => s.setScrollX);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const selectedKeyframeIds = useTimelineStore((s) => s.view.selectedKeyframeIds);
  const expandedLayerIds = useTimelineStore((s) => s.view.expandedLayerIds);
  const expandedEffectTrackIds = useTimelineStore((s) => s.view.expandedEffectTrackIds);
  const globalEffects = useTimelineStore((s) => s.globalEffects);
  const selectKeyframes = useTimelineStore((s) => s.selectKeyframes);
  const clearContentFrameSelection = useTimelineStore((s) => s.clearContentFrameSelection);
  const clearKeyframeSelection = useTimelineStore((s) => s.clearKeyframeSelection);
  const contentFrameDragPreview = useTimelineStore((s) => s.view.contentFrameDragPreview);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const { addKeyframe, addContentFrame } = useTimelineHistory();

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

  // PERF FIX: Compute visible frame range for viewport-based virtualization.
  // Only ContentFrameBlocks and keyframe diamonds that overlap the visible area
  // will be rendered, reducing DOM elements from O(totalFrames) to O(visibleFrames).
  const containerWidth = internalRef.current?.clientWidth ?? 1200;
  const VIRTUALIZATION_MARGIN = 100; // px margin for smooth scrolling
  const visibleLeft = scrollX - VIRTUALIZATION_MARGIN;
  const visibleRight = scrollX + containerWidth + VIRTUALIZATION_MARGIN;

  // PERF FIX: Stable onContextMenu handler for ContentFrameBlock.
  // Previously an inline arrow function was passed, defeating React.memo —
  // new function reference every render meant ALL ContentFrameBlocks re-rendered
  // on every parent re-render (O(F) per mouse move during drag).
  const handleContentFrameContextMenu = useCallback(
    (e: React.MouseEvent, cfId: ContentFrameId, layerIdParam: LayerId) => {
      e.preventDefault();
      e.stopPropagation();
      const selectedIds = useTimelineStore.getState().view.selectedContentFrameIds;
      const frameIds = selectedIds.has(cfId) && selectedIds.size > 0
        ? [...selectedIds]
        : [cfId];
      const trackEl = e.currentTarget.parentElement;
      const rect = trackEl?.getBoundingClientRect();
      const clickX = rect ? e.clientX - rect.left + (internalRef.current?.scrollLeft ?? 0) : 0;
      const clickFrame = Math.max(0, Math.round(clickX / pxPerFrame));
      setContextMenu({ x: e.clientX, y: e.clientY, context: { kind: 'frame', layerId: layerIdParam, frameIds, clickFrame } });
    },
    [pxPerFrame],
  );

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
      const renderedGroupIds = new Set<string>();

      for (const layer of displayLayers) {
        // Check for group header
        const group = layer.parentGroupId
          ? layerGroups.find(g => g.id === layer.parentGroupId)
          : null;
        if (group && !renderedGroupIds.has(group.id as string)) {
          renderedGroupIds.add(group.id as string);
          yOffset += 28; // Group header height (min-h-[28px])

          // Group property track rows (when expanded)
          const groupExpanded = !group.collapsed;
          if (groupExpanded && group.propertyTracks.length > 0) {
            for (const track of group.propertyTracks) {
              const trackTop = yOffset;
              const trackBottom = yOffset + TRACK_ROW_H;
              for (const kf of track.keyframes) {
                const kfX = kf.frame * pxPerFrame;
                if (kfX >= left - 6 && kfX <= right + 6 && trackBottom > top && trackTop < bottom) {
                  result.push(kf.id);
                }
              }
              yOffset += TRACK_ROW_H;
            }
          }
        }

        // Skip collapsed group children
        if (group && group.collapsed) continue;

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
    [displayLayers, expandedLayerIds, pxPerFrame, layerGroups],
  );

  const handleTrackAreaMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left button clicks on the background (not on diamonds or content frames)
      if (e.button !== 0) return;

      const el = internalRef.current;
      if (!el) return;

      // BUGFIX: Don't deselect frames when clicking the scrollbar.
      // The scrollbar area is outside the clientWidth/clientHeight but inside the element bounds.
      const rect = el.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      if (clickX > el.clientWidth || clickY > el.clientHeight) {
        return; // Click is on the scrollbar — don't deselect
      }

      clearContentFrameSelection();
      const startX = e.clientX - rect.left + el.scrollLeft;
      const startY = e.clientY - rect.top + el.scrollTop;

      // Capture modifier keys at mousedown time
      const isShiftDrag = e.shiftKey;
      const isAltDrag = e.altKey;
      // Snapshot the current selection for additive/subtractive modes
      const baseSelection = isShiftDrag || isAltDrag
        ? new Set(useTimelineStore.getState().view.selectedKeyframeIds)
        : null;

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
        const marqueeSet = new Set(kfIds);

        if (isAltDrag && baseSelection) {
          // Alt+drag: remove marquee keyframes from the base selection
          const result = new Set(baseSelection);
          for (const id of marqueeSet) result.delete(id);
          useTimelineStore.getState().selectKeyframes([...result]);
        } else if (isShiftDrag && baseSelection) {
          // Shift+drag: add marquee keyframes to the base selection
          const result = new Set(baseSelection);
          for (const id of marqueeSet) result.add(id);
          useTimelineStore.getState().selectKeyframes([...result]);
        } else {
          // Normal drag: replace selection
          useTimelineStore.getState().selectKeyframes(kfIds);
        }

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
        {(() => {
          const renderedGroupIds = new Set<string>();
          const items: React.ReactNode[] = [];

          // Global effects track rows at top
          if (globalEffects.length > 0) {
            // Global header spacer (matches GlobalEffectsTrackHeader height)
            items.push(
              <div key="global-effects-header-spacer" className="border-b border-border/50 bg-muted/20" style={{ minHeight: 28 }} />
            );
            // Global effect track rows
            for (const track of globalEffects) {
              items.push(
                <div key={`global-et-${track.id}`} className="relative border-b border-border/30 min-h-[24px] bg-muted/10">
                  <EffectBlockComponent track={track} pxPerFrame={pxPerFrame} />
                </div>
              );
              // Effect property keyframe sub-rows (when expanded)
              if (expandedEffectTrackIds.has(track.effectBlock.id)) {
                for (const pt of track.effectBlock.propertyTracks) {
                  items.push(
                    <div key={`global-ept-${pt.id}`} className="relative border-b border-border/20 min-h-[20px] bg-muted/5">
                      {pt.keyframes.map((kf) => (
                        <div
                          key={kf.id}
                          className="absolute w-2.5 h-2.5 rotate-45 bg-yellow-500/80 z-10"
                          style={{ left: kf.frame * pxPerFrame - 4, top: 5 }}
                          title={`${pt.propertyPath}: ${kf.value} @ frame ${kf.frame}`}
                        />
                      ))}
                    </div>
                  );
                }
              }
            }
          }

          displayLayers.forEach((layer) => {
            // Check for group header
            const group = layer.parentGroupId
              ? layerGroups.find(g => g.id === layer.parentGroupId)
              : null;

            // Insert group header spacer to match LayerList
            if (group && !renderedGroupIds.has(group.id as string)) {
              renderedGroupIds.add(group.id as string);
              // Group header row
              items.push(
                <div
                  key={`group-spacer-${group.id}`}
                  className="border-b border-border/50 bg-muted/40"
                  style={{ minHeight: 28 }}
                />
              );

              // Group property track rows (when expanded)
              const groupExpanded = !group.collapsed;
              if (groupExpanded && group.propertyTracks.length > 0) {
                const sortedTracks = [...group.propertyTracks].sort((a, b) => {
                  const idxA = PROPERTY_DISPLAY_ORDER.indexOf(a.propertyPath);
                  const idxB = PROPERTY_DISPLAY_ORDER.indexOf(b.propertyPath);
                  return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
                });

                for (const track of sortedTracks) {
                  // Use first child layer as proxy layerId for KeyframeDiamond
                  const proxyLayerId = group.childLayerIds[0];
                  items.push(
                    <div
                      key={`group-track-${group.id}-${track.id}`}
                      className="relative border-b border-border/30 min-h-[24px] bg-muted/10 cursor-crosshair"
                      onDoubleClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const frame = Math.round(clickX / pxPerFrame);
                        if (frame >= 0) {
                          const currentValue = getGroupPropertyValue(group, track.propertyPath, frame);
                          const kfId = generateKeyframeId();
                          useTimelineStore.setState((s) => ({
                            layerGroups: s.layerGroups.map(g => g.id !== group.id ? g : {
                              ...g, propertyTracks: g.propertyTracks.map(t => t.id !== track.id ? t : {
                                ...t, keyframes: [...t.keyframes, { id: kfId, frame, value: currentValue, easing: defaultEasing() }].sort((a: { frame: number }, b: { frame: number }) => a.frame - b.frame),
                              }),
                            }),
                          }));
                          selectKeyframes([kfId]);
                          setEditingKeyframe(kfId);
                        }
                      }}
                      onContextMenu={(e) => {
                        if ((e.target as HTMLElement).closest('[data-keyframe]')) return;
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickX = e.clientX - rect.left + (internalRef.current?.scrollLeft ?? 0);
                        const clickFrame = Math.max(0, Math.round(clickX / pxPerFrame));
                        setContextMenu({ x: e.clientX, y: e.clientY, context: { kind: 'property-track', layerId: proxyLayerId, trackId: track.id, clickFrame } });
                      }}
                    >
                      {track.keyframes.map((kf) => (
                        <KeyframeDiamond
                          key={kf.id}
                          layerId={proxyLayerId}
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
                            setContextMenu({ x: e.clientX, y: e.clientY, context: { kind: 'keyframe', layerId: proxyLayerId, trackId: track.id, keyframeIds: kfIds } });
                          }}
                        />
                      ))}
                      {/* Ghost loop indicators */}
                      {track.loopKeyframes && track.keyframes.length >= 2 && (() => {
                        const sorted = [...track.keyframes].sort((a, b) => a.frame - b.frame);
                        const loopStart = sorted[0].frame;
                        const loopEnd = sorted[sorted.length - 1].frame;
                        const loopLen = loopEnd - loopStart;
                        if (loopLen <= 0) return null;
                        const ghosts: React.ReactNode[] = [];
                        let rep = 1;
                        while (true) {
                          const offset = rep * loopLen;
                          for (const kf of sorted) {
                            const ghostFrame = kf.frame + offset;
                            if (ghostFrame > durationFrames) break;
                            const left = ghostFrame * pxPerFrame - scrollX;
                            ghosts.push(
                              <div
                                key={`ghost-${kf.id}-r${rep}`}
                                className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                                style={{ left: `${left}px` }}
                              >
                                <div className="w-2 h-2 rounded-full bg-muted-foreground/30 -translate-x-1/2" />
                              </div>
                            );
                          }
                          if (loopStart + offset > durationFrames) break;
                          rep++;
                        }
                        return ghosts;
                      })()}
                    </div>
                  );
                }
              }
            }

            // Skip collapsed group children
            if (group && group.collapsed) return;

            items.push(
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
              {/* Content frame blocks — virtualized: only render visible ones */}
              {layer.contentFrames.filter((cf) => {
                const blockLeft = cf.startFrame * pxPerFrame;
                const blockRight = (cf.startFrame + cf.durationFrames) * pxPerFrame;
                return blockRight >= visibleLeft && blockLeft <= visibleRight;
              }).map((cf) => (
                <ContentFrameBlock
                  key={cf.id}
                  layerId={layer.id}
                  contentFrame={cf}
                  pxPerFrame={pxPerFrame}
                  scrollX={scrollX}
                  onContextMenu={handleContentFrameContextMenu}
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

              {/* + button after last content frame */}
              {layer.contentFrames.length > 0 && !isPlaybackActive && (() => {
                const sorted = [...layer.contentFrames].sort((a, b) => a.startFrame - b.startFrame);
                const lastCf = sorted[sorted.length - 1];
                const afterLastFrame = lastCf.startFrame + lastCf.durationFrames;
                const leftPx = afterLastFrame * pxPerFrame + 4;
                if (leftPx < visibleLeft || leftPx > visibleRight + 50) return null;
                return (
                  <TooltipProvider key="add-frame-btn">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors z-10"
                          style={{ left: leftPx }}
                          onClick={(e) => {
                            e.stopPropagation();
                            addContentFrame(layer.id, afterLastFrame, 1);
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>Add new frame</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
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
                  {/* Ghost loop indicators */}
                  {track.loopKeyframes && track.keyframes.length >= 2 && (() => {
                    const sorted = [...track.keyframes].sort((a, b) => a.frame - b.frame);
                    const loopStart = sorted[0].frame;
                    const loopEnd = sorted[sorted.length - 1].frame;
                    const loopLen = loopEnd - loopStart;
                    if (loopLen <= 0) return null;
                    const ghosts: React.ReactNode[] = [];
                    let rep = 1;
                    while (true) {
                      const offset = rep * loopLen;
                      for (const kf of sorted) {
                        const ghostFrame = kf.frame + offset;
                        if (ghostFrame > durationFrames) break;
                        const left = ghostFrame * pxPerFrame - scrollX;
                        ghosts.push(
                          <div
                            key={`ghost-${kf.id}-r${rep}`}
                            className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ left: `${left}px` }}
                          >
                            <div className="w-2 h-2 rounded-full bg-muted-foreground/30 -translate-x-1/2" />
                          </div>
                        );
                      }
                      if (loopStart + offset > durationFrames) break;
                      rep++;
                    }
                    return ghosts;
                  })()}
                </div>
              );
            })}

            {/* Spacer row matching the "+ Add Property" button row */}
            {expandedLayerIds.has(layer.id) && (
              <div className="min-h-[24px] border-b border-border/30 bg-muted/5" />
            )}

            {/* Effect track rows (when layer is expanded) */}
            {expandedLayerIds.has(layer.id) && (layer.effectTracks ?? []).map((track) => (
              <React.Fragment key={`et-${track.id}`}>
                <div className="relative border-b border-border/30 min-h-[24px] bg-muted/5">
                  <EffectBlockComponent track={track} pxPerFrame={pxPerFrame} />
                </div>
                {/* Effect property keyframe sub-rows (when effect block is expanded) */}
                {expandedEffectTrackIds.has(track.effectBlock.id) && track.effectBlock.propertyTracks.map((pt) => (
                  <div key={`ept-${pt.id}`} className="relative border-b border-border/20 min-h-[20px] bg-muted/5">
                    {pt.keyframes.map((kf) => (
                      <div
                        key={kf.id}
                        className="absolute w-2.5 h-2.5 rotate-45 bg-yellow-500/80 z-10"
                        style={{ left: kf.frame * pxPerFrame - 4, top: 5 }}
                        title={`${pt.propertyPath}: ${kf.value} @ frame ${kf.frame}`}
                      />
                    ))}
                  </div>
                ))}
              </React.Fragment>
            ))}

            {/* Effect "Add Effect" spacer row */}
            {expandedLayerIds.has(layer.id) && (
              <div className="min-h-[20px] border-b border-border/30 bg-muted/5" />
            )}
          </div>
            );
          });

          return items;
        })()}

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
