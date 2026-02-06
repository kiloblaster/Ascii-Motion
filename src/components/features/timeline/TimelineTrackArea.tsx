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
import { ContentFrameBlock } from './ContentFrameBlock';
import { KeyframeDiamond } from './KeyframeDiamond';
import { cn } from '@/lib/utils';

/** Pixels per frame at zoom=1 */
const BASE_PX_PER_FRAME = 12;

export const TimelineTrackArea: React.FC = () => {
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

  const containerRef = useRef<HTMLDivElement>(null);
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
    const el = containerRef.current;
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

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-x-auto overflow-y-auto"
      onScroll={handleScroll}
    >
      <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
        {displayLayers.map((layer) => (
          <div key={layer.id}>
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
            </div>

            {/* Property track rows (only when layer is expanded) */}
            {expandedLayerIds.has(layer.id) && layer.propertyTracks.map((track) => (
              <div
                key={track.id}
                className="relative border-b border-border/30 min-h-[24px] bg-muted/10"
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
            ))}

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
