# Ink Test CLI

A simple CLI project for testing ASCII Motion Ink component exports.

## Setup

```bash
cd dev-tools/ink-test-cli
npm install
```

## Testing Exported Components

1. **Export from ASCII Motion**: Use the "Ink Component" export option
2. **Copy the file**: Move the exported `.tsx` file to `./src/`
3. **Update the import** in `src/cli.tsx`:

```tsx
// Change this:
// import { AsciiMotionCli } from './ascii-motion-cli.js';

// To match your exported file:
import { YourComponentName } from './your-file-name.js';
```

4. **Update the render** in `src/cli.tsx`:

```tsx
const App: React.FC = () => {
  return <YourComponentName hasDarkBackground={hasDarkBackground} autoPlay={true} loop={true} />;
};
```

## Running

```bash
# Run with dark terminal background (default)
npm run dev

# Run with dark background explicitly
npm run test:dark

# Run with light background
npm run test:light

# Show help
npm run dev -- --help
```

## Theme Customization

The exported component includes two theme dictionaries:

**ANSI Mode:**
```tsx
const THEME_DARK = { cyan: 'cyan', magenta: 'magenta', ... };
const THEME_LIGHT = { cyan: 'cyan', magenta: 'magenta', ... };
```

**Hex Mode:**
```tsx
const COLORS_DARK = { c0: '#00ffff', c1: '#ff00ff', ... };
const COLORS_LIGHT = { c0: '#00ffff', c1: '#ff00ff', ... };
```

Edit these dictionaries in your exported file to customize colors for each background type.

## Troubleshooting

- **Module not found**: Make sure you're importing with `.js` extension (ES modules require it)
- **Colors look wrong**: Try switching between `--dark` and `--light` flags
- **Animation too fast/slow**: Edit the `duration` values in the FRAMES array
