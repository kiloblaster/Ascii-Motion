/**
 * ASCII Motion — React Export Test Harness
 * 
 * Drop an exported .tsx/.jsx file from ASCII Motion into src/ and import it below.
 * This page renders the component with controls and shows file stats.
 * 
 * Usage:
 *   1. Export a React component from ASCII Motion
 *   2. Copy the .tsx file into this project's src/ folder
 *   3. Update the import below to match the filename
 *   4. Run: npm run dev
 *   5. Open http://localhost:3099
 */

// ── Import your exported component here ──
// import AsciiMotionAnimation from './ascii-motion-animation'
// Uncomment the line above and update the filename to match your export.

import { useCallback, useRef } from 'react';
import AsciiMotionAnimationEffects from './ascii-motion-animation-effects';

type PlaybackApi = {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  restart: () => void;
};

export default function MyPage() {
  const playbackRef = useRef<PlaybackApi | null>(null);
  const handleReady = useCallback((api: PlaybackApi) => {
    playbackRef.current = api;
  }, []);

  return (
    <div>
      <AsciiMotionAnimationEffects
        autoPlay={true}
        onReady={handleReady}
      />
    </div>
  );
}

