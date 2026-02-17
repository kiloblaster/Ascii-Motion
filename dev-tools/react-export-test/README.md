# React Export Test Harness

A minimal React + Vite project for testing ASCII Motion's exported React components.

## Setup

```bash
cd dev-tools/react-export-test
npm install
```

## Usage

1. **Export** a React component from ASCII Motion (Export → React Component)
2. **Copy** the exported `.tsx` file into `src/`
3. **Update the import** in `src/App.tsx`:
   ```tsx
   import AsciiMotionAnimation from './ascii-motion-animation'
   // ...
   const AnimationComponent = AsciiMotionAnimation
   ```
4. **Run** the dev server:
   ```bash
   npm run dev
   ```
5. **Open** http://localhost:3099

## Notes

- The test harness renders the component on a dark background to simulate typical deployment
- Exported components are fully self-contained — no additional dependencies needed
- Both `.tsx` (TypeScript) and `.jsx` (JavaScript) exports are supported
- The component exposes `autoPlay`, `showControls`, and `onReady` props
