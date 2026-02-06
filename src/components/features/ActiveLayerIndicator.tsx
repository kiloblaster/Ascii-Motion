/**
 * Active Layer Indicator
 * 
 * Shows the name of the currently active layer in the editor header,
 * next to the project name. Displays nothing when no layers are loaded
 * (backward compatible with v1 projects).
 * 
 * Part of the Layer Timeline Refactor (Phase 2)
 * See: docs/LAYER_TIMELINE_REFACTOR_PLAN.md §2.6
 */

import { useTimelineStore } from '../../stores/timelineStore';

export function ActiveLayerIndicator() {
  const activeLayer = useTimelineStore((s) => {
    const id = s.view.activeLayerId;
    if (!id) return null;
    return s.layers.find((l) => l.id === id) ?? null;
  });

  // Don't render anything if no layers (v1 mode)
  if (!activeLayer) return null;

  return (
    <span
      className="text-muted-foreground text-sm ml-2 truncate max-w-[120px]"
      title={`Active layer: ${activeLayer.name}`}
    >
      ({activeLayer.name})
    </span>
  );
}
