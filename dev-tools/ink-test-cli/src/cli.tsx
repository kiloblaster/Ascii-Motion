#!/usr/bin/env node
import React from 'react';
import { render, Box, Text } from 'ink';

// Import your exported Ink component:
import { AsciiMotionCli256 } from './ascii-motion-cli_256.js';

// Parse CLI arguments
const args = process.argv.slice(2);
const hasDarkBackground = !args.includes('--light');
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  console.log(`
ASCII Motion Ink Test CLI
==========================

Usage:
  npm run dev              Run with dark background (default)
  npm run test:dark        Run with dark background
  npm run test:light       Run with light background

Options:
  --dark    Use dark background theme (default)
  --light   Use light background theme
  --help    Show this help message

Setup:
  1. Export an Ink Component from ASCII Motion
  2. Copy the .tsx file to ./src/
  3. Update the import in cli.tsx
  4. Run: npm run dev
`);
  process.exit(0);
}

// Placeholder component - replace with your exported component
const PlaceholderAnimation: React.FC<{ hasDarkBackground: boolean }> = ({ hasDarkBackground }) => {
  const [frame, setFrame] = React.useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  React.useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Text color={hasDarkBackground ? 'cyan' : 'blue'} bold>
        ASCII Motion - Ink Test CLI
      </Text>
      <Text color={hasDarkBackground ? 'gray' : 'blackBright'}>
        ────────────────────────────
      </Text>
      <Box marginTop={1}>
        <Text color={hasDarkBackground ? 'green' : 'greenBright'}>
          {frames[frame]} Loading animation...
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={hasDarkBackground ? 'yellow' : 'yellowBright'}>
          Theme: {hasDarkBackground ? 'Dark Background' : 'Light Background'}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          ┌─────────────────────────────────────┐
        </Text>
        <Text dimColor>
          │ To test your exported component:    │
        </Text>
        <Text dimColor>
          │                                     │
        </Text>
        <Text dimColor>
          │ 1. Export from ASCII Motion         │
        </Text>
        <Text dimColor>
          │ 2. Copy .tsx file to ./src/         │
        </Text>
        <Text dimColor>
          │ 3. Update import in cli.tsx         │
        </Text>
        <Text dimColor>
          │ 4. Run: npm run dev                 │
        </Text>
        <Text dimColor>
          └─────────────────────────────────────┘
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={hasDarkBackground ? 'magenta' : 'magentaBright'}>
          Press Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  );
};

// Main app - using your exported component
const App: React.FC = () => {
  return <AsciiMotionCli256 hasDarkBackground={hasDarkBackground} autoPlay={true} loop={true} />;
};

render(<App />);
