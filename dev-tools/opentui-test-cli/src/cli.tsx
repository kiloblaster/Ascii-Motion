import React from 'react';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { AsciiMotionTuiSemantic } from './ascii-motion-tui-semantic.js';

/**
 * OpenTUI Test CLI
 * 
 * This is a test harness for ASCII Motion OpenTUI component exports.
 * 
 * Usage:
 * 1. Export an animation from ASCII Motion using "OpenTUI Component" export
 * 2. Copy the exported .tsx file into this src/ directory
 * 3. Uncomment and update the import statement above
 * 4. Replace the DemoComponent below with your exported component
 * 5. Run: npm run dev
 */

// Main entry point
async function main() {
  const renderer = await createCliRenderer();
  
  createRoot(renderer).render(
    // @ts-ignore - React 19 JSX type compatibility
    <AsciiMotionTuiSemantic 
      hasDarkBackground={true} 
      autoPlay={true} 
      loop={true} 
    />
  );
}

main().catch(console.error);
