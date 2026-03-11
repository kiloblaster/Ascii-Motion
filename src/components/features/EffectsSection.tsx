/**
 * EffectsSection - Collapsible effects section for the right panel
 * 
 * Creates procedural effect blocks on the active layer's timeline.
 * Uses the effect registry for available effects.
 */

import { useState } from 'react';
import { Button } from '../ui/button';
import { 
  Collapsible,
  CollapsibleContent,
} from '../ui/collapsible';
import { CollapsibleHeader } from '../common/CollapsibleHeader';
import { useTimelineStore } from '../../stores/timelineStore';
import { useEffectBlockHistory } from '../../hooks/useEffectBlockHistory';
import { getAllEffects } from '../../registry/effectRegistry';
import { Wand2 } from 'lucide-react';

interface EffectsSectionProps {
  className?: string;
}

export function EffectsSection({ className = '' }: EffectsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const addEffectBlock = useTimelineStore((s) => s.addEffectBlock);
  const selectEffectBlock = useTimelineStore((s) => s.selectEffectBlock);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const { recordAdd } = useEffectBlockHistory();

  const registeredEffects = getAllEffects();

  const handleEffectClick = (effectType: string) => {
    const ownerId = activeLayerId;
    const start = currentFrame;
    const duration = Math.max(1, durationFrames - start);
    const blockId = addEffectBlock(ownerId, effectType, start, duration);
    if (blockId) {
      recordAdd(ownerId, blockId);
      selectEffectBlock(blockId);
      // Auto-expand the layer to show the new effect
      const tl = useTimelineStore.getState();
      if (ownerId && !tl.view.expandedLayerIds.has(ownerId as import('../../types/timeline').LayerId)) {
        tl.toggleLayerExpanded(ownerId as import('../../types/timeline').LayerId);
      }
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleHeader isOpen={isOpen}>
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4" />
            Effects
          </div>
        </CollapsibleHeader>
        
        <CollapsibleContent className="collapsible-content mt-2">
          <div className="space-y-2">
            {registeredEffects.map((effect) => (
              <Button
                key={effect.type}
                variant="outline"
                size="sm"
                onClick={() => handleEffectClick(effect.type)}
                className="w-full justify-start gap-2 h-8 text-xs"
                title={effect.description}
              >
                <effect.icon className="w-3 h-3" />
                {effect.name}
              </Button>
            ))}

            {registeredEffects.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No effects registered
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}