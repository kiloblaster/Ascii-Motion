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

import React, { useCallback, useRef, useEffect } from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useTimelineHistory } from '../../../hooks/useTimelineHistory';
import { ContentFrameBlock } from './ContentFrameBlock';
import { KeyframeDiamond } from './KeyframeDiamond';
import { PROPERTY_DEFINITIONS } from '../../../types/timeline';
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
  const contentFrameDragPreview = useTimelineStore((s) => s.view.contentFrameDragPreview);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const { addKeyframe } = useTimelineHistory();

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

  // Clear content frame selection when clicking empty track space
  const handleTrackAreaMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only clear if the click target is the track area itself or a layer row,
      // not a content frame block (which calls stopPropagation)
      clearContentFrameSelection();
    },
    [clearContentFrameSelection],
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
            >
              {/* Content frame blocks */}
              {layer.contentFrames.map((cf) => (
                <ContentFrameBlock
                  key={cf.id}
                  layerId={layer.id}
                  contentFrame={cf}
                  pxPerFrame={pxPerFrame}
                  scrollX={scrollX}
                />
              ))}

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
            {expandedLayerIds.has(layer.id) && layer.propertyTracks.map((track) => {
              const definition = PROPERTY_DEFINITIONS[track.propertyPath];
              const defaultValue = (definition?.defaultValue as number) ?? 0;

              const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const frame = Math.round(clickX / pxPerFrame);
                if (frame >= 0) {
                  const kfId = addKeyframe(layer.id, track.id, frame, defaultValue);
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

        {/* Playhead line spanning all rows */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500/50 pointer-events-none z-10"
          style={{ left: currentFrame * pxPerFrame }}
        />
      </div>
    </div>
  );
};
