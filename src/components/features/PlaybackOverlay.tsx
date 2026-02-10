import React from 'react';
import { PlaybackControls } from './PlaybackControls';
import { useTimelineStore } from '../../stores/timelineStore';
import { useAnimationStore } from '../../stores/animationStore';
import { useOptimizedPlayback } from '../../hooks/useOptimizedPlayback';
import { useFrameNavigation } from '../../hooks/useFrameNavigation';

interface PlaybackOverlayProps {
  isVisible: boolean;
}

/**
 * Floating playback controls overlay for when timeline is collapsed.
 * Dual-mode: drives layer/timeline playback when layers exist,
 * falls back to legacy frame playback otherwise.
 */
export const PlaybackOverlay: React.FC<PlaybackOverlayProps> = ({ isVisible }) => {
  const layers = useTimelineStore((s) => s.layers);
  const isLayerMode = layers.length > 0;

  // Dual-mode state
  const tlIsPlaying = useTimelineStore((s) => s.view.isPlaying);
  const tlLooping = useTimelineStore((s) => s.view.looping);
  const legacyIsPlaying = useAnimationStore((s) => s.isPlaying);
  const legacyLooping = useAnimationStore((s) => s.looping);

  const isPlaying = isLayerMode ? tlIsPlaying : legacyIsPlaying;
  const looping = isLayerMode ? tlLooping : legacyLooping;

  const {
    startOptimizedPlayback,
    stopOptimizedPlayback,
    canPlay,
  } = useOptimizedPlayback();

  const {
    navigateNext,
    navigatePrevious,
    navigateFirst,
    navigateLast,
    currentFrameIndex,
    totalFrames,
  } = useFrameNavigation();

  const handleToggleLoop = () => {
    if (isLayerMode) {
      useTimelineStore.getState().setLooping(!looping);
    } else {
      useAnimationStore.getState().setLooping(!looping);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`
        absolute bottom-16 left-1/2 transform -translate-x-1/2 
        transition-all duration-300 ease-in-out z-10
        bg-background/95 backdrop-blur-md border border-border/50 rounded-lg shadow-lg p-1
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}
      `}
    >
      <PlaybackControls
        isPlaying={isPlaying}
        canPlay={canPlay}
        currentFrame={currentFrameIndex}
        totalFrames={totalFrames}
        onPlay={startOptimizedPlayback}
        onPause={stopOptimizedPlayback}
        onPrevious={navigatePrevious}
        onNext={navigateNext}
        onFirst={navigateFirst}
        onLast={navigateLast}
        onToggleLoop={handleToggleLoop}
        isLooping={looping}
      />
    </div>
  );
};
