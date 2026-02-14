/**
 * LayerMenu — hamburger-style dropdown menu for layer operations.
 *
 * Sits at the leftmost position in the TimelineToolbar, separated from
 * frame editing buttons by a vertical divider. Provides access to:
 *  - Merge Down, Merge Visible, Flatten Layer
 *  - Create Group, Ungroup
 *  - Select All Layers
 *
 * Part of the Layer Timeline Refactor (Phase 7)
 */

import React from 'react';
import { useTimelineStore } from '../../../stores/timelineStore';
import { useTimelineHistory } from '../../../hooks/useTimelineHistory';
import { Button } from '../../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import {
  Menu,
  Merge,
  Eye,
  Group,
  Ungroup,
} from 'lucide-react';
import type { LayerId } from '../../../types/timeline';

export const LayerMenu: React.FC = () => {
  const layers = useTimelineStore((s) => s.layers);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const selectedLayerIds = useTimelineStore((s) => s.view.selectedLayerIds);
  const layerGroups = useTimelineStore((s) => s.layerGroups);
  const { mergeDown, mergeVisible, createGroup, ungroupLayers } = useTimelineHistory();

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const activeIndex = activeLayer ? layers.indexOf(activeLayer) : -1;
  const canMergeDown = activeIndex > 0;
  const visibleCount = layers.filter((l) => l.visible).length;
  const canMergeVisible = visibleCount >= 2;

  // Layers available for grouping: selected layers, or active + below
  const groupCandidateIds = selectedLayerIds.size >= 2
    ? Array.from(selectedLayerIds)
    : (activeLayerId && activeIndex > 0)
      ? [layers[activeIndex - 1].id, activeLayerId]
      : [];
  const canCreateGroup = groupCandidateIds.length >= 2 &&
    groupCandidateIds.every(id => !layers.find(l => l.id === id)?.parentGroupId);

  // Check if active layer belongs to a group
  const activeGroup = activeLayer?.parentGroupId
    ? layerGroups.find((g) => g.id === activeLayer.parentGroupId)
    : null;

  const handleMergeDown = () => {
    if (activeLayerId && canMergeDown) {
      mergeDown(activeLayerId);
    }
  };

  const handleMergeVisible = () => {
    mergeVisible();
  };

  const handleCreateGroup = () => {
    if (groupCandidateIds.length >= 2) {
      createGroup('Group', groupCandidateIds as LayerId[]);
    }
  };

  const handleUngroup = () => {
    if (activeGroup) {
      ungroupLayers(activeGroup.id);
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1"
            >
              <Menu className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Layer operations</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuItem
          onClick={handleMergeDown}
          disabled={!canMergeDown}
        >
          <Merge className="w-4 h-4 mr-2" />
          Merge Down
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handleMergeVisible}
          disabled={!canMergeVisible}
        >
          <Eye className="w-4 h-4 mr-2" />
          Merge Visible
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleCreateGroup}
          disabled={!canCreateGroup}
        >
          <Group className="w-4 h-4 mr-2" />
          Create Group{groupCandidateIds.length >= 2 ? ` (${groupCandidateIds.length} layers)` : ''}
        </DropdownMenuItem>

        {activeGroup && (
          <DropdownMenuItem onClick={handleUngroup}>
            <Ungroup className="w-4 h-4 mr-2" />
            Ungroup "{activeGroup.name}"
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
