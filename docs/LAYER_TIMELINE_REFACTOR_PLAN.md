# Layer Timeline System Refactor Plan

> **Version:** 2.0.0  
> **Created:** February 1, 2026  
> **Last Updated:** February 5, 2026  
> **Status:** In Progress — Phase 4 Keyframe System (transform-aware tools complete)  
> **Target Completion:** TBD  
> **Estimated Duration:** 16-22 weeks

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Vision & Goals](#vision--goals)
3. [Branching & Deployment Safety Strategy](#branching--deployment-safety-strategy)
4. [New Data Model](#new-data-model)
5. [Phase 1: Foundation](#phase-1-foundation)
6. [Phase 2: Layer Data Model (Core)](#phase-2-layer-data-model-core)
7. [Phase 3: Timeline UI](#phase-3-timeline-ui)
8. [Phase 4: Keyframe System](#phase-4-keyframe-system)
9. [Phase 5: Export & Migration](#phase-5-export--migration)
10. [Phase 6: Integration](#phase-6-integration)
11. [Phase 7: Advanced Layer Features](#phase-7-advanced-layer-features)
12. [File Change Matrix](#file-change-matrix)
13. [Testing Strategy](#testing-strategy)
14. [Performance Considerations](#performance-considerations)
15. [Backward Compatibility](#backward-compatibility)
16. [Risks & Mitigations](#risks--mitigations)
17. [Implementation Progress](#implementation-progress)

---

## Executive Summary

This document outlines a major architectural refactor to introduce an After Effects-style layer and keyframe timeline system to ASCII Motion. The refactor replaces the current frame-based animation model with a layer-based composition system where:

- **Layers** contain content frames (ASCII canvas data) with draggable duration
- **Transform properties** (position, scale, rotation, opacity, anchor point) are keyframeable per layer
- **Any property** in the app can eventually be added to the timeline and keyframed
- **Two timeline views** exist: simplified Frame View and advanced Layer/Timeline View
- **Effects** can be applied per-layer or globally, with keyframeable properties

### Key Deliverables

- Layer-based composition system with Z-order rendering
- Keyframe animation with cubic bezier easing
- Resizable timeline panel with layer tracks and property editors
- Live canvas preview during keyframe editing
- Session format v2.0.0 with backward-compatible loading
- MCP protocol v2.0.0 with layer support
- Subscription tier integration (5 layers free, unlimited Pro)

---

## Vision & Goals

### User Experience Goals

1. **Professional Animation Workflow**: Layer-based timeline matching industry tools like After Effects
2. **Non-Destructive Editing**: Layers preserve original content while transforms are applied
3. **Visual Feedback**: Live canvas updates during all property edits, anchor point overlay
4. **Flexible Organization**: Rename, reorder, show/hide, solo, and lock layers
5. **Intuitive Keyframing**: Click to add keyframes, drag to adjust timing, visual easing editor

### Technical Goals

1. **Incremental Implementation**: Each phase is testable and deployable independently
2. **Performance**: Maintain 60fps with layer compositing via render caching
3. **Undo/Redo**: All layer and keyframe operations are undoable from day one
4. **Backward Compatibility**: Load v1.0.0 projects as single-layer compositions
5. **Forward Compatibility**: Extensible property system for future keyframeable properties

---

## Branching & Deployment Safety Strategy

### ⚠️ Core Principle: Zero Risk to Production

The deployed `main` branch must remain fully functional and deployable at all times throughout this multi-month refactor. No experimental layer code will ever reach production until the entire feature is verified and approved.

### Repository Overview

This refactor spans multiple repositories in the workspace:

| Repository | Purpose | Branch Name | Production Branch |
|------------|---------|-------------|-------------------|
| **Ascii-Motion** (main) | Core application | `feature/layer-timeline` | `main` |
| **ascii-motion-mcp** | MCP server package | `feature/layer-timeline` | `main` |
| **premium submodule** | Cloud storage, auth, subscriptions | `feature/layer-timeline` | `main` |

### Branch Architecture

```
main (PRODUCTION - NEVER TOUCHED DIRECTLY)
 │
 ├── Vercel auto-deploys from main → production URL
 │
 └── feature/layer-timeline (LONG-LIVED FEATURE BRANCH)
      │
      ├── feature/layer-timeline/phase-1-foundation
      ├── feature/layer-timeline/phase-2-layer-model
      ├── feature/layer-timeline/phase-3-timeline-ui
      ├── feature/layer-timeline/phase-4-keyframes
      ├── feature/layer-timeline/phase-5-export
      ├── feature/layer-timeline/phase-6-integration
      └── feature/layer-timeline/phase-7-advanced
```

### Branch Creation Order

```bash
# 1. Main repository (create first)
cd Ascii-Motion
git checkout main
git pull origin main
git checkout -b feature/layer-timeline
git push -u origin feature/layer-timeline

# 2. Create phase sub-branch (repeat for each phase)
git checkout feature/layer-timeline
git checkout -b feature/layer-timeline/phase-1-foundation
git push -u origin feature/layer-timeline/phase-1-foundation

# 3. MCP repository (only when Phase 6 begins)
cd ../ascii-motion-mcp
git checkout main
git pull origin main
git checkout -b feature/layer-timeline
git push -u origin feature/layer-timeline

# 4. Premium submodule (only when Phase 2 begins - subscription tier)
cd ../Ascii-Motion/packages/premium
git checkout main
git pull origin main
git checkout -b feature/layer-timeline
git push -u origin feature/layer-timeline

# 5. Update main repo's submodule reference on feature branch only
cd ../..
git checkout feature/layer-timeline
git add packages/premium
git commit -m "chore: update premium submodule to feature/layer-timeline branch"
```

### Merge Strategy (Phase-by-Phase)

Each phase follows a strict merge ladder:

```
1. Work on: feature/layer-timeline/phase-N-xxx
2. PR → feature/layer-timeline (squash merge, require review)
3. Run full test suite on feature/layer-timeline
4. Deploy preview from feature/layer-timeline for manual QA
5. Only after ALL phases complete: PR → main (final merge)
```

**Phase sub-branches merge UP to `feature/layer-timeline` only.** The `feature/layer-timeline` branch does NOT merge to `main` until the entire feature is complete and verified.

### Deployment Safety Rules

| Environment | Branch Source | Trigger | Risk Level |
|-------------|-------------|---------|------------|
| **Production** (vercel.com) | `main` | Auto-deploy on push to `main` | 🟢 Zero — never touched during refactor |
| **Preview** (preview URL) | `feature/layer-timeline` | Manual `vercel deploy --preview` | 🟡 Low — isolated URL, not public |
| **Local Dev** | Any phase branch | `npm run dev` | 🟢 Zero — local only |

**Critical deployment rules:**
1. **NEVER** merge `feature/layer-timeline` → `main` until ALL phases complete
2. **NEVER** run `vercel deploy --prod` from any feature branch
3. **NEVER** push directly to `main` — all changes go through PRs
4. Preview deployments use Vercel's preview URLs (not the production domain)
5. The production Vercel deployment only triggers on `main` branch pushes

### Vercel Configuration Safety

Ensure `vercel.json` and Vercel dashboard settings enforce:

```json
// vercel.json - already configured, but verify:
{
  "git": {
    "deploymentEnabled": {
      "main": true,
      "feature/layer-timeline": false
    }
  }
}
```

If Vercel auto-deploys on all branches, **disable it** for feature branches in the Vercel dashboard:
- Go to Project Settings → Git → Production Branch → set to `main` only
- Disable "Preview Deployments" for the `feature/layer-timeline` pattern, OR
- Use manual `vercel deploy` for preview testing only when needed

### Regular Sync with Main

To prevent divergence, regularly sync `main` into the feature branch:

```bash
# Weekly sync (or after any hotfix to main):
git checkout feature/layer-timeline
git pull origin main
# Resolve any conflicts
git push origin feature/layer-timeline
```

**If a hotfix is needed on production during the refactor:**
1. Branch from `main` → `hotfix/xxx`
2. Fix, PR, merge to `main` (production deploys automatically)
3. Sync `main` into `feature/layer-timeline` to pick up the fix
4. Never branch hotfixes from the feature branch

### Cross-Repository Coordination

| Phase | Ascii-Motion | premium submodule | ascii-motion-mcp |
|-------|-------------|-------------------|------------------|
| 1-Foundation | ✅ Active | ❌ Not needed | ❌ Not needed |
| 2-Layer Model | ✅ Active | ✅ Subscription tier | ❌ Not needed |
| 3-Timeline UI | ✅ Active | ❌ Not needed | ❌ Not needed |
| 4-Keyframes | ✅ Active | ❌ Not needed | ❌ Not needed |
| 5-Export | ✅ Active | ✅ Cloud storage | ❌ Not needed |
| 6-Integration | ✅ Active | ❌ Not needed | ✅ MCP v2 protocol |
| 7-Advanced | ✅ Active | ❌ Not needed | ❌ Not needed |

**Merge order for final release:**
1. Premium submodule → merge `feature/layer-timeline` to `main` first
2. Update Ascii-Motion submodule reference to premium `main`
3. MCP package → merge `feature/layer-timeline` to `main`, publish to npm
4. Ascii-Motion → final PR from `feature/layer-timeline` to `main`
5. Verify production deployment

### Rollback Plan

If critical issues are discovered after the final merge to `main`:

```bash
# Immediate rollback: revert the merge commit
git revert -m 1 <merge-commit-hash>
git push origin main
# Vercel auto-deploys the reverted main → production restored

# Then fix issues on feature branch and re-merge when ready
```

For the premium submodule and MCP package, the same revert strategy applies independently.

### Branch Protection Rules

**`main` branch:**
- Require PR reviews before merge (minimum 1 reviewer)
- Require passing CI checks (lint, type-check, unit tests)
- No direct pushes
- No force pushes
- Require linear history (squash merges preferred)

**`feature/layer-timeline` branch:**
- Require PR reviews for phase sub-branch merges
- Require passing CI checks
- Allow direct pushes during active development (for iteration speed)
- Protect against force pushes (preserve history)

### Pre-Merge Checklist (Final Merge to Main)

Before the final `feature/layer-timeline` → `main` PR is approved:

- [ ] All phase testing checkpoints pass
- [ ] v1.0.0 session files load correctly (backward compatibility)
- [ ] v2.0.0 session save/load round-trip works
- [ ] Cloud save/load works with both v1 and v2 projects
- [ ] All 12+ export formats produce correct output
- [ ] Performance benchmarks pass (60fps playback with 5 layers)
- [ ] MCP tools work with new protocol
- [ ] No console errors in production build
- [ ] `npm run build` succeeds with zero warnings
- [ ] Preview deployment tested manually for 24+ hours
- [ ] Memory usage stays under 200MB for typical projects
- [ ] No regressions in existing single-layer workflows

---

## Development Guidelines

### Commit & Deployment Policy

**⚠️ CRITICAL: No Automatic Commits or Deployments**

1. **No Automatic Commits**: Do not commit any changes automatically. All changes must be manually inspected before committing.
   - Wait for explicit approval before staging changes
   - Allow manual review of all file modifications
   - Only commit when explicitly asked to do so

2. **No Automatic Deployments**: Do not deploy to any environment unless explicitly requested.
   - No `npm run deploy` or `npm run deploy:preview` without explicit instruction
   - No Vercel CLI deployments without approval
   - Manual deployment triggers only

3. **Manual Inspection Workflow**:
   ```bash
   # After making changes, wait for manual review
   git status                    # Review changed files
   git diff                      # Inspect changes
   # Only after approval:
   git add <files>               # Stage approved changes
   git commit -m "..."           # Commit with descriptive message
   ```

### UI Component Standards

**Use Shadcn/UI Components for All New UI**

All new UI components added during this refactor must use the existing Shadcn component library to maintain consistency with the rest of the application.

**Required Patterns:**

1. **Use Existing Components**: Leverage components from `src/components/ui/`:
   - `Button`, `Input`, `Switch`, `Slider` for controls
   - `DropdownMenu`, `ContextMenu` for menus
   - `Dialog`, `Popover`, `Tooltip` for overlays
   - `Tabs` for view switching
   - `Card` for content containers

2. **Shadcn MCP Integration**: Use the installed Shadcn MCP to add any new components needed:
   ```bash
   # If a new component is needed, use Shadcn MCP to add it
   # Components will be added to src/components/ui/
   ```

3. **Styling Guidelines**:
   - Use Tailwind CSS classes (v3.x - do NOT upgrade to v4)
   - Use CSS variables for theming (`hsl(var(--primary))`, etc.)
   - Follow existing component patterns in the codebase
   - Refer to `COPILOT_INSTRUCTIONS.md` for Shadcn styling requirements

4. **New Component Checklist**:
   - [ ] Uses Shadcn base components where applicable
   - [ ] Follows existing naming conventions
   - [ ] Uses Radix tooltips (never HTML `title` attributes)
   - [ ] Respects dark/light theme via CSS variables
   - [ ] Matches existing visual style and spacing

**Example - Timeline Tab Component:**
```tsx
// ✅ CORRECT: Using Shadcn Tabs
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function TimelineTabs() {
  return (
    <Tabs defaultValue="layers">
      <TabsList>
        <TabsTrigger value="layers">Timeline</TabsTrigger>
        <TabsTrigger value="frames">Frames (Simple)</TabsTrigger>
      </TabsList>
      <TabsContent value="layers">
        <LayerTimeline />
      </TabsContent>
      <TabsContent value="frames">
        <FrameTimeline />
      </TabsContent>
    </Tabs>
  );
}

// ❌ WRONG: Custom implementation without Shadcn
export function TimelineTabs() {
  return (
    <div className="flex">
      <button className="px-4 py-2">Timeline</button>
      <button className="px-4 py-2">Frames</button>
    </div>
  );
}
```

---

## Coordinate Space Architecture

> **Added:** 2026-02-07 based on Phase 4 implementation experience.

### The Two Coordinate Spaces

When layers have keyframed transforms (position, rotation, scale, anchor point), there are two coordinate spaces:

| Space | Description | Used By |
|-------|-------------|--------|
| **Screen space** | What the user sees after compositing. Cell `(5,3)` on screen is where the composited renderer drew it. | Mouse event handlers, selection overlays, hover previews, UI feedback |
| **Local space** (layer-local) | The raw cell positions in `canvasStore.cells` / `contentFrame.data`. Before transforms are applied. | `setCell()`, `getCell()`, `clearCell()`, `fillArea()`, `setCanvasData()` |

When a layer has `positionX=2, positionY=1`, a cell stored at local `(3, 2)` appears at screen `(5, 3)` after compositing.

### Transform Utility: `src/utils/layerTransformUtils.ts`

Centralized utilities for converting between spaces:

| Function | Direction | Usage |
|----------|-----------|-------|
| `screenToLocal(x, y)` | Screen → Local | Drawing tools, fill seeds, selection copy reads, magic wand BFS |
| `localToScreen(x, y)` | Local → Screen | Preview rendering (gradient preview overlay) |
| `transformCellMapToLocal(cells)` | Screen → Local (bulk) | Bezier commit, ASCII type/box commit, paste operations |
| `transformCellMapToScreen(cells)` | Local → Screen (bulk) | Gradient/effect preview rendering on canvas overlay |
| `inverseTransformPoint(sx, sy, transform)` | Screen → Local (raw) | Low-level inverse of compositing forward transform |

### Which Tools Need Which Transform

**Drawing tools** (`useDrawingTool.ts`) — Inverse transform applied inside `drawAtPosition()`, `drawRectangle()`, `drawEllipse()` before `setCell()`. The mouse coordinate conversion (`getGridCoordinatesFromEvent`) stays in screen space so hover overlays remain aligned.

**Brush smoothing** (`useCanvasDragAndDrop.ts`) — Gap-fill between mouse samples uses `screenToLocal()` before `drawBrushLine()`/`eraseBrushLine()` because `pencilLastPosition` is stored in local space by `drawAtPosition`.

**Selection copy** (`toolStore.ts`) — `screenToLocal()` on each selected cell key before `canvasData.get()` since canvasStore cells are in local space.

**Selection move** (`useCanvasState.ts`) — `screenToLocal()` on both original position keys (for delete) and destination keys (for set) in `commitMove()`.

**Paste** (`usePasteMode.ts`) — `transformCellMapToLocal()` on the absolute-coordinate paste map.

**Magic wand** (`useCanvasMagicWandSelection.ts`) — `getCellLocal()` wrapper around `getCell()` for BFS flood fill and initial target read.

**Bezier/ASCII type/ASCII box commit** — `transformCellMapToLocal()` on the preview cell map before `setCanvasData()`.

**Gradient** — Special case: fill area seed, gradient start/end, and ellipse point all inverse-transformed to local space. Output is local. Preview rendering forward-transforms via `transformCellMapToScreen()` for canvas overlay display.

**Text tool** — `screenToLocal()` in `insertCharacter()`, `handleBackspace()`, `handlePaste()`.

**Selection constraint** (`selectionConstraint.ts`) — `localToScreen()` applied in `isCellDrawable()`, `isCellDrawableWithState()`, `constrainCellsToSelection()` etc. Drawing tools pass local-space coords; selection masks are screen-space, so the constraint functions forward-transform before checking membership.

### Key Rule

> **Mouse events → screen space → drawing tools inverse-transform → canvasStore (local space) → compositing forward-transforms → rendered output (screen space)**
>
> Overlays and selection masks stay in screen space. Only the write path goes through inverse transform.
> Preview overlays that display local-space data must forward-transform for visual alignment.

### Impact on Future Phases

- **Phase 5 (Export)**: Export composites via `compositeLayersAtFrame()` which already handles forward transforms. No inverse transform needed — exports read from composited output.
- **Phase 6 (Effects)**: Layer-scoped effects may need to read cell data. If they read from `canvasStore.cells`, they're in local space. If they need screen-space awareness, use `localToScreen()`.
- **Phase 6 (Generators)**: Generators create new layers with content frames — data is always in local space (no transform on a new layer's default identity transform). No transform utilities needed.
- **Phase 7 (Multi-layer drawing)**: If `applyToAllLayers` mode draws to multiple layers simultaneously, each layer has its own transform. The inverse transform must be computed per-layer, not globally.

---

## State Synchronization Architecture

### Overview

The layer timeline system requires careful synchronization between multiple stores. This section defines the canonical source of truth and sync behavior for each piece of state.

### Store Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                        timelineStore                             │
│  (CANONICAL source for layers, keyframes, playhead, view state) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ sync
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         canvasStore                              │
│     (Working buffer for active layer's current content frame)    │
└─────────────────────────────────────────────────────────────────┘
```

### Synchronization Rules

**1. Canvas Store ↔ Content Frame Sync**

The `canvasStore.cells` acts as a working buffer for the **active layer's current content frame**.

| Event | Direction | Action |
|-------|-----------|--------|
| User draws on canvas | Canvas → Timeline | After debounce (300ms idle), sync `canvasStore.cells` into the active layer's current content frame via `updateContentFrameData()` |
| User changes active layer | Timeline → Canvas | Copy the new layer's current content frame data into `canvasStore.cells` |
| User changes current frame | Timeline → Canvas | Copy the active layer's content frame at new frame into `canvasStore.cells` |
| Playhead enters gap (no content frame) | Timeline → Canvas | Clear `canvasStore.cells` to empty (blank canvas) |
| User presses Save/Export | Canvas → Timeline | Force immediate sync before serialization |
| Browser tab closing | Canvas → Timeline | Force immediate sync via `beforeunload` event |

**Data Loss Prevention:**

```typescript
// src/utils/syncGuard.ts - NEW FILE

/**
 * Ensures unsaved canvas changes are synced to timeline before data loss events.
 * Solves the risk of 300ms debounce losing data on rapid tab close.
 */
export function initSyncGuard() {
  // 1. Force sync before tab close
  window.addEventListener('beforeunload', (e) => {
    const { isDirty } = useCanvasStore.getState();
    if (isDirty) {
      syncCanvasToTimelineImmediate();
    }
  });
  
  // 2. Periodic background sync (every 30 seconds) as insurance
  setInterval(() => {
    const { isDirty } = useCanvasStore.getState();
    if (isDirty) {
      syncCanvasToTimelineImmediate();
    }
  }, 30_000);
  
  // 3. Sync before visibility change (tab switch, minimize)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const { isDirty } = useCanvasStore.getState();
      if (isDirty) {
        syncCanvasToTimelineImmediate();
      }
    }
  });
}

// Call during app initialization:
// initSyncGuard();
```

**2. Drawing Sync Flow**

```typescript
// When user finishes a drawing operation:
function onDrawingComplete() {
  // 1. Drawing updates canvasStore.cells directly (for immediate feedback)
  // 2. Debounced sync saves to timeline
  debouncedSyncToContentFrame();
}

// Implementation in canvasStore:
const debouncedSyncToContentFrame = debounce(() => {
  const { activeLayerId, currentFrame } = useTimelineStore.getState().view;
  const activeLayer = useTimelineStore.getState().layers.find(l => l.id === activeLayerId);
  
  if (!activeLayer) return;
  
  // Find content frame at current playhead position
  const contentFrame = activeLayer.contentFrames.find(
    cf => currentFrame >= cf.startFrame && currentFrame < cf.startFrame + cf.durationFrames
  );
  
  if (contentFrame) {
    // Update the content frame with current canvas data
    useTimelineStore.getState().updateContentFrameData(
      activeLayerId,
      contentFrame.id,
      new Map(cells)  // Clone to avoid reference issues
    );
  }
}, 300);
```

**3. Layer Switch Sync**

```typescript
// When switching active layers:
setActiveLayer: (layerId: LayerId | null) => {
  const { view, config } = get();
  
  // 1. Force sync current canvas to previous layer's content frame
  syncCanvasToTimelineImmediate();
  
  // 2. Update active layer
  set({ view: { ...view, activeLayerId: layerId } });
  
  // 3. Load new layer's content frame into canvas
  const newLayer = get().layers.find(l => l.id === layerId);
  if (newLayer) {
    const contentFrame = getContentFrameAtTime(newLayer, view.currentFrame);
    if (contentFrame) {
      useCanvasStore.getState().setCells(new Map(contentFrame.data));
    } else {
      // Gap in content - show blank canvas
      useCanvasStore.getState().clearCells();
    }
  }
}
```

**4. Frame Navigation Sync**

```typescript
// When playhead moves to a new frame:
goToFrame: (frame: number) => {
  const { view } = get();
  
  // 1. Sync current canvas to timeline (if changed)
  if (canvasStore.isDirty) {
    syncCanvasToTimelineImmediate();
  }
  
  // 2. Update playhead
  set({ view: { ...view, currentFrame: frame } });
  
  // 3. Load content frame at new position
  const activeLayer = get().layers.find(l => l.id === view.activeLayerId);
  if (activeLayer) {
    const contentFrame = getContentFrameAtTime(activeLayer, frame);
    if (contentFrame) {
      useCanvasStore.getState().setCells(new Map(contentFrame.data));
    } else {
      useCanvasStore.getState().clearCells();
    }
  }
}
```

### Content Frame Gap Behavior

When the playhead is at a position where no content frame exists for the active layer:

1. **Canvas displays blank** - The `canvasStore.cells` is cleared
2. **Drawing creates new content frame** - If user draws at a gap position, a new 1-frame content frame is created at that position
3. **Compositing shows nothing** - The layer contributes nothing to the composite at that frame
4. **Export renders blank for that layer** - The layer is effectively invisible during gaps

```typescript
// When user draws during a gap:
function onDrawAtGap(layerId: LayerId, frame: number) {
  const newContentFrame: ContentFrame = {
    id: generateContentFrameId(),
    name: `Frame at ${frame}`,
    startFrame: frame,
    durationFrames: 1,  // Start with 1 frame, user can extend
    data: new Map(canvasStore.cells),
  };
  
  addContentFrame(layerId, newContentFrame);
}
```

---

## Frame View Specification

### Overview

The "Frame View" is a simplified alternative to the full "Layer/Timeline View". It presents the animation as a sequence of flattened frames, similar to the pre-layer workflow, but the underlying data model remains layer-based.

### Frame View Behavior

**Data Presentation:**
- Each "frame" in Frame View is the **composited result** of all visible layers at that timeline frame
- Users see a linear sequence of frames, not individual layers
- Identical consecutive composited frames are merged into a single visual frame with a duration indicator

**No Manual Duration Controls:**
- Unlike the old frame-based system, frames in Frame View don't have draggable duration handles
- Duration is determined by the underlying layer content frames and timeline length
- To adjust timing, users must switch to Layer View

**Flattening Algorithm:**

```typescript
/**
 * Generate Frame View frames from layer data.
 * Consecutive identical frames are merged into one.
 */
function generateFrameViewFrames(
  layers: Layer[],
  durationFrames: number,
  canvasWidth: number,
  canvasHeight: number
): FrameViewFrame[] {
  const result: FrameViewFrame[] = [];
  let currentFrame: FrameViewFrame | null = null;
  
  for (let f = 0; f < durationFrames; f++) {
    const compositedCells = compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight);
    const hash = hashCellMap(compositedCells);
    
    if (currentFrame && currentFrame.hash === hash) {
      // Same as previous - extend duration
      currentFrame.durationFrames += 1;
    } else {
      // New unique frame
      if (currentFrame) result.push(currentFrame);
      currentFrame = {
        timelineFrame: f,  // First timeline frame this represents
        durationFrames: 1,
        cells: compositedCells,
        hash,
        thumbnail: generateThumbnail(compositedCells),
      };
    }
  }
  
  if (currentFrame) result.push(currentFrame);
  return result;
}

interface FrameViewFrame {
  timelineFrame: number;    // Starting timeline frame
  durationFrames: number;   // How many consecutive frames look identical
  cells: Map<string, Cell>; // Composited cell data
  hash: string;             // For identity comparison
  thumbnail?: string;       // Base64 preview
}
```

**Frame View UI:**

```typescript
function FrameViewPanel() {
  const layers = useTimelineStore((s) => s.layers);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const goToFrame = useTimelineStore((s) => s.goToFrame);
  
  const frameViewFrames = useMemo(
    () => generateFrameViewFrames(layers, durationFrames, canvasWidth, canvasHeight),
    [layers, durationFrames]
  );
  
  return (
    <div className="flex gap-2 overflow-x-auto p-2">
      {frameViewFrames.map((frame, idx) => (
        <div
          key={idx}
          className="flex-shrink-0 cursor-pointer border rounded p-1"
          onClick={() => goToFrame(frame.timelineFrame)}
        >
          {/* Thumbnail */}
          <img src={frame.thumbnail} className="w-24 h-16 object-contain" />
          
          {/* Frame info */}
          <div className="text-xs text-center">
            {frame.durationFrames > 1 
              ? `Frames ${frame.timelineFrame}-${frame.timelineFrame + frame.durationFrames - 1}`
              : `Frame ${frame.timelineFrame}`
            }
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Editing in Frame View:**
- Clicking a frame navigates to that timeline position (first frame if merged)
- Drawing edits the **active layer** at the current frame (same as Layer View)
- Users must switch to Layer View to manage layers, keyframes, or content frame timing

---

## New Data Model

### Core Type Definitions

```typescript
// src/types/timeline.ts - NEW FILE

// ============================================
// BRANDED ID TYPES
// ============================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

export type LayerId = Brand<string, 'LayerId'>;
export type ContentFrameId = Brand<string, 'ContentFrameId'>;
export type KeyframeId = Brand<string, 'KeyframeId'>;
export type PropertyTrackId = Brand<string, 'PropertyTrackId'>;

// ============================================
// LAYER SYSTEM
// ============================================

/**
 * A layer in the composition. Contains content frames (ASCII data)
 * and transform property tracks with keyframes.
 */
export interface Layer {
  id: LayerId;
  name: string;
  
  // Visibility & interaction
  visible: boolean;        // Eyeball icon - affects render and export
  solo: boolean;           // Solo mode - only render this layer
  locked: boolean;         // Prevent editing
  
  // Content frames (ASCII canvas data with duration)
  contentFrames: ContentFrame[];
  
  // Transform property tracks (keyframeable)
  propertyTracks: PropertyTrack[];
  
  // Layer-level settings
  opacity: number;         // 0-100, default 100
  blendMode: BlendMode;    // Future: 'normal' | 'multiply' | etc.
}

/**
 * A content frame represents a segment of ASCII canvas data
 * with a start time and duration. Users can drag edges to
 * adjust duration in the timeline.
 */
export interface ContentFrame {
  id: ContentFrameId;
  name: string;
  
  // Timing (in frames, not milliseconds)
  startFrame: number;      // When this content starts
  durationFrames: number;  // How long it lasts (draggable edges)
  
  // Canvas data for this frame
  data: Map<string, Cell>; // Key: "x,y" coordinate string
  
  // Optional thumbnail for timeline display
  thumbnail?: string;      // Base64 data URL
}

/**
 * A property track contains keyframes for a single animatable property.
 * Examples: position.x, position.y, scale, rotation, opacity, anchorPoint.x
 */
export interface PropertyTrack {
  id: PropertyTrackId;
  propertyPath: PropertyPath;  // e.g., 'transform.position.x'
  keyframes: Keyframe[];
  
  // Loop behavior
  loopKeyframes: boolean;  // Loop keyframe pattern until end of timeline
}

/**
 * Known property paths that can be keyframed.
 * This is extensible - any property can be added here.
 */
export type PropertyPath =
  // Transform properties
  | 'transform.position.x'
  | 'transform.position.y'
  | 'transform.scale'        // Uniform scale (1.0 = 100%)
  | 'transform.rotation'     // Degrees
  | 'transform.opacity'      // 0-100
  | 'transform.anchorPoint.x'
  | 'transform.anchorPoint.y'
  // Future: effect properties
  | `effect.${string}.${string}`;

/**
 * Property metadata for UI display and validation.
 */
export interface PropertyDefinition {
  path: PropertyPath;
  displayName: string;
  category: 'transform' | 'effect' | 'style';
  valueType: 'number' | 'boolean' | 'string' | 'color';
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;  // 'px', '%', '°', etc.
}

/**
 * Registry of all keyframeable properties.
 */
export const PROPERTY_DEFINITIONS: Record<PropertyPath, PropertyDefinition> = {
  'transform.position.x': {
    path: 'transform.position.x',
    displayName: 'Position X',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    step: 1,
    unit: 'cells',
  },
  'transform.position.y': {
    path: 'transform.position.y',
    displayName: 'Position Y',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    step: 1,
    unit: 'cells',
  },
  'transform.scale': {
    path: 'transform.scale',
    displayName: 'Scale',
    category: 'transform',
    valueType: 'number',
    defaultValue: 1,
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: 'x',
  },
  'transform.rotation': {
    path: 'transform.rotation',
    displayName: 'Rotation',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    min: -3600,   // Allow multiple rotations
    max: 3600,
    step: 1,      // 1° increments
    unit: '°',
  },
  'transform.opacity': {
    path: 'transform.opacity',
    displayName: 'Opacity',
    category: 'transform',
    valueType: 'number',
    defaultValue: 100,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
  },
  'transform.anchorPoint.x': {
    path: 'transform.anchorPoint.x',
    displayName: 'Anchor X',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    step: 1,
    unit: 'cells',
  },
  'transform.anchorPoint.y': {
    path: 'transform.anchorPoint.y',
    displayName: 'Anchor Y',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    step: 1,
    unit: 'cells',
  },
};

// ============================================
// KEYFRAME SYSTEM
// ============================================

/**
 * A single keyframe on a property track.
 */
export interface Keyframe {
  id: KeyframeId;
  frame: number;           // Frame number (not milliseconds)
  value: number | boolean | string;
  easing: EasingCurve;
}

/**
 * Cubic bezier easing curve definition.
 * Control points: (0,0) -> (x1,y1) -> (x2,y2) -> (1,1)
 */
export interface EasingCurve {
  type: EasingPreset | 'custom';
  // For custom curves:
  x1?: number;  // 0-1
  y1?: number;  // Can be < 0 or > 1 for overshoot
  x2?: number;  // 0-1
  y2?: number;  // Can be < 0 or > 1 for overshoot
}

/**
 * Preset easing types.
 */
export type EasingPreset =
  | 'linear'
  | 'hold'           // No interpolation, jump to next value
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-out-back'  // Slight overshoot
  | 'ease-in-back'
  | 'bounce';

/**
 * Preset easing curve values.
 */
export const EASING_PRESETS: Record<EasingPreset, [number, number, number, number]> = {
  'linear': [0, 0, 1, 1],
  'hold': [0, 0, 0, 0],  // Special case: no interpolation
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  'ease-out-back': [0.34, 1.56, 0.64, 1],
  'ease-in-back': [0.36, 0, 0.66, -0.56],
  'bounce': [0.34, 1.4, 0.64, 1],  // Simplified bounce
};

// ============================================
// TIMELINE STATE
// ============================================

/**
 * Global timeline configuration.
 */
export interface TimelineConfig {
  frameRate: number;       // FPS (e.g., 24, 30, 60)
  durationFrames: number;  // Total timeline length in frames
  
  // Derived (computed)
  durationMs: number;      // Total duration in milliseconds
}

/**
 * Timeline view state (UI).
 */
export interface TimelineViewState {
  activeView: 'frames' | 'layers';  // Tab selection
  
  // Playhead position
  currentFrame: number;
  isPlaying: boolean;
  looping: boolean;
  
  // Selection
  activeLayerId: LayerId | null;
  selectedLayerIds: Set<LayerId>;
  selectedKeyframeIds: Set<KeyframeId>;
  
  // UI state
  zoom: number;            // Timeline zoom level
  scrollX: number;         // Horizontal scroll position
  panelHeight: number;     // Resizable panel height in pixels
  
  // Property editing
  editingKeyframeId: KeyframeId | null;
}

/**
 * Timecode display format.
 */
export type TimecodeFormat = 
  | 'frames'           // "Frame 24"
  | 'seconds'          // "1.5s"
  | 'timecode'         // "00:01:12" (MM:SS:FF)
  | 'milliseconds';    // "1500ms"

// ============================================
// EFFECTS SYSTEM EXTENSION
// ============================================

/**
 * Effect application scope.
 */
export type EffectScope = 'layer' | 'global';

/**
 * Effect instance with keyframeable properties.
 */
export interface EffectInstance {
  id: string;
  effectType: string;      // e.g., 'wave', 'colorShift', 'blur'
  scope: EffectScope;
  layerId?: LayerId;       // Required when scope is 'layer'
  enabled: boolean;
  propertyTracks: PropertyTrack[];  // Keyframeable effect properties
  order: number;           // Render order (lower = applied first)
}

// ============================================
// BLEND MODES (FUTURE)
// ============================================

export type BlendMode = 'normal';  // Only 'normal' for Phase 1
// Future: 'multiply' | 'screen' | 'overlay' | 'difference'

// ============================================
// SESSION FORMAT V2
// ============================================

/**
 * Session data format version 2.0.0 with layer support.
 */
export interface SessionDataV2 {
  version: '2.0.0';
  
  // Project metadata
  name?: string;
  description?: string;
  metadata?: {
    exportedAt: string;
    exportVersion: string;
    userAgent?: string;
  };
  
  // Canvas settings (shared across all layers)
  canvas: {
    width: number;
    height: number;
    canvasBackgroundColor: string;
    showGrid: boolean;
  };
  
  // Timeline configuration
  timeline: {
    frameRate: number;
    durationFrames: number;
    looping: boolean;
  };
  
  // Layer data (NEW - replaces animation.frames)
  layers: SessionLayerV2[];
  
  // Layer groups (NEW)
  layerGroups?: SessionLayerGroupV2[];
  
  // Global effects (NEW)
  globalEffects?: SessionEffectV2[];
  
  // Preserved from v1
  tools?: SessionToolState;
  ui?: SessionUIState;
  typography?: TypographySettings;
  palettes?: PaletteState;
  characterPalettes?: CharacterPaletteState;
}

/**
 * Serialized layer for session files.
 */
export interface SessionLayerV2 {
  id: string;
  name: string;
  visible: boolean;
  solo: boolean;
  locked: boolean;
  opacity: number;
  
  // Group membership (if layer is in a group)
  parentGroupId?: string;
  
  // Content frames (serialized)
  contentFrames: SessionContentFrameV2[];
  
  // Property tracks (serialized)
  propertyTracks: SessionPropertyTrackV2[];
}

/**
 * Serialized content frame.
 */
export interface SessionContentFrameV2 {
  id: string;
  name: string;
  startFrame: number;
  durationFrames: number;
  data: Record<string, Cell>;  // Object form for JSON
}

/**
 * Serialized property track.
 */
export interface SessionPropertyTrackV2 {
  id: string;
  propertyPath: string;
  loopKeyframes: boolean;
  keyframes: SessionKeyframeV2[];
}

/**
 * Serialized keyframe.
 */
export interface SessionKeyframeV2 {
  id: string;
  frame: number;
  value: number | boolean | string;
  easing: EasingCurve;
}

/**
 * Serialized layer group.
 */
export interface SessionLayerGroupV2 {
  id: string;
  name: string;
  childLayerIds: string[];
  visible: boolean;
  solo: boolean;
  locked: boolean;
  collapsed: boolean;
  propertyTracks: SessionPropertyTrackV2[];
}

/**
 * Serialized effect.
 */
export interface SessionEffectV2 {
  id: string;
  effectType: string;
  scope: EffectScope;
  layerId?: string;
  enabled: boolean;
  order: number;
  propertyTracks: SessionPropertyTrackV2[];
}
```

### Type Migration Utilities

```typescript
// src/utils/sessionMigration.ts - NEW FILE

import { SessionData } from '../types/export';  // v1 format
import { SessionDataV2, SessionLayerV2 } from '../types/timeline';

/**
 * Detect session format version.
 */
export function detectSessionVersion(data: unknown): '1.0.0' | '2.0.0' | 'unknown' {
  if (typeof data !== 'object' || data === null) return 'unknown';
  
  const session = data as Record<string, unknown>;
  
  if (session.version === '2.0.0' && 'layers' in session) {
    return '2.0.0';
  }
  
  if ('animation' in session && 'frames' in (session.animation as object)) {
    return '1.0.0';
  }
  
  return 'unknown';
}

/**
 * Migrate v1.0.0 session to v2.0.0 format.
 * Converts frame-based animation to single-layer composition.
 */
export function migrateV1ToV2(v1: SessionData): SessionDataV2 {
  const frameRate = v1.animation?.frameRate ?? 24;
  
  // Convert v1 frames to content frames
  const contentFrames: SessionContentFrameV2[] = [];
  let currentFrame = 0;
  
  for (const frame of v1.animation?.frames ?? []) {
    // Convert duration from ms to frames
    const durationFrames = Math.max(1, Math.round(frame.duration / (1000 / frameRate)));
    
    contentFrames.push({
      id: frame.id,
      name: frame.name,
      startFrame: currentFrame,
      durationFrames,
      data: frame.data instanceof Map 
        ? Object.fromEntries(frame.data) 
        : frame.data,
    });
    
    currentFrame += durationFrames;
  }
  
  // Calculate total duration
  const durationFrames = currentFrame || frameRate; // Default 1 second
  
  // Create single layer from v1 animation
  const defaultLayer: SessionLayerV2 = {
    id: 'layer-1',
    name: 'Layer 1',
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    contentFrames,
    propertyTracks: [],  // No keyframes in migrated projects
  };
  
  return {
    version: '2.0.0',
    name: v1.name,
    description: v1.description,
    metadata: v1.metadata,
    canvas: v1.canvas ?? {
      width: 80,
      height: 24,
      canvasBackgroundColor: '#1a1a2e',
      showGrid: true,
    },
    timeline: {
      frameRate,
      durationFrames,
      looping: v1.animation?.looping ?? true,
    },
    layers: [defaultLayer],
    tools: v1.tools,
    ui: v1.ui,
    typography: v1.typography,
    palettes: v1.palettes,
    characterPalettes: v1.characterPalettes,
  };
}
```

---

## Phase 1: Foundation

**Duration:** 1-2 weeks  
**Goal:** Establish type system, feature branches, and store architecture  
**Status:** ✅ Code complete (§1.2–§1.6b done). Undo batching (§1.7) deferred to Phase 3. Tests (§1.8) pending.

### 1.1 Create Feature Branches

**All Repositories:**

```bash
# Main repo
git checkout -b feature/layer-timeline

# MCP repo
git checkout -b feature/layer-timeline

# Premium submodule
git checkout -b feature/layer-timeline
```

### 1.2 Create New Type Files

**New Files:**
- `src/types/timeline.ts` - All interfaces from [New Data Model](#new-data-model)
- `src/types/easing.ts` - Easing curve utilities and presets
- `src/utils/sessionMigration.ts` - v1→v2 migration logic

### 1.3 Create Timeline Store

**New File:** `src/stores/timelineStore.ts`

```typescript
// src/stores/timelineStore.ts

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  Layer, LayerId, ContentFrame, ContentFrameId,
  PropertyTrack, Keyframe, KeyframeId,
  TimelineConfig, TimelineViewState, PropertyPath,
  EffectInstance,
} from '../types/timeline';

interface TimelineState {
  // Configuration
  config: TimelineConfig;
  
  // Layers (ordered by z-index, first = bottom)
  layers: Layer[];
  
  // Global effects
  globalEffects: EffectInstance[];
  
  // View state
  view: TimelineViewState;
  
  // ============================================
  // LAYER ACTIONS
  // ============================================
  
  addLayer: (name?: string) => LayerId;
  removeLayer: (layerId: LayerId) => void;
  duplicateLayer: (layerId: LayerId) => LayerId;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  renameLayer: (layerId: LayerId, name: string) => void;
  
  setLayerVisible: (layerId: LayerId, visible: boolean) => void;
  setLayerSolo: (layerId: LayerId, solo: boolean) => void;
  setLayerLocked: (layerId: LayerId, locked: boolean) => void;
  setLayerOpacity: (layerId: LayerId, opacity: number) => void;
  
  getActiveLayer: () => Layer | null;
  setActiveLayer: (layerId: LayerId | null) => void;
  
  // ============================================
  // LAYER GROUP ACTIONS
  // ============================================
  
  createGroup: (name?: string, layerIds?: LayerId[]) => LayerGroupId;
  ungroupLayers: (groupId: LayerGroupId) => void;
  addLayerToGroup: (layerId: LayerId, groupId: LayerGroupId) => void;
  removeLayerFromGroup: (layerId: LayerId) => void;
  setGroupVisible: (groupId: LayerGroupId, visible: boolean) => void;
  setGroupSolo: (groupId: LayerGroupId, solo: boolean) => void;
  setGroupLocked: (groupId: LayerGroupId, locked: boolean) => void;
  setGroupCollapsed: (groupId: LayerGroupId, collapsed: boolean) => void;
  
  // ============================================
  // CONTENT FRAME ACTIONS
  // ============================================
  
  /**
   * All content frame mutations validate against overlaps.
   * Content frames on the same layer must NOT overlap in time.
   * If a mutation would cause overlap, it is rejected and returns null.
   */
  addContentFrame: (layerId: LayerId, startFrame: number, durationFrames: number) => ContentFrameId | null;
  removeContentFrame: (layerId: LayerId, frameId: ContentFrameId) => void;
  updateContentFrameTiming: (layerId: LayerId, frameId: ContentFrameId, startFrame: number, durationFrames: number) => boolean;
  updateContentFrameData: (layerId: LayerId, frameId: ContentFrameId, data: Map<string, Cell>) => void;
  
  getContentFrameAtTime: (layerId: LayerId, frame: number) => ContentFrame | null;
  
  /**
   * Validate that no content frames overlap on a given layer.
   * Called internally by addContentFrame and updateContentFrameTiming.
   * Also called by importSession to validate incoming data.
   */
  validateContentFrameTimings: (layerId: LayerId) => boolean;
  
  // ============================================
  // KEYFRAME ACTIONS
  // ============================================
  
  addPropertyTrack: (layerId: LayerId, propertyPath: PropertyPath) => PropertyTrackId;
  removePropertyTrack: (layerId: LayerId, trackId: PropertyTrackId) => void;
  
  addKeyframe: (layerId: LayerId, trackId: PropertyTrackId, frame: number, value: number) => KeyframeId;
  removeKeyframe: (layerId: LayerId, trackId: PropertyTrackId, keyframeId: KeyframeId) => void;
  updateKeyframe: (layerId: LayerId, trackId: PropertyTrackId, keyframeId: KeyframeId, updates: Partial<Keyframe>) => void;
  moveKeyframe: (layerId: LayerId, trackId: PropertyTrackId, keyframeId: KeyframeId, newFrame: number) => void;
  
  getPropertyValueAtFrame: (layerId: LayerId, propertyPath: PropertyPath, frame: number) => number;
  
  setKeyframeLooping: (layerId: LayerId, trackId: PropertyTrackId, loop: boolean) => void;
  
  // ============================================
  // PLAYBACK ACTIONS
  // ============================================
  
  play: () => void;
  pause: () => void;
  stop: () => void;
  goToFrame: (frame: number) => void;
  nextFrame: () => void;
  previousFrame: () => void;
  
  setLooping: (looping: boolean) => void;
  setFrameRate: (fps: number, maintainDuration: boolean) => void;
  setDuration: (frames: number) => void;
  
  // ============================================
  // TIMELINE AUTO-EXPAND
  // ============================================
  
  /**
   * Ensure timeline is long enough to contain content at the given frame.
   * Called automatically when content is added/extended past current duration.
   */
  ensureTimelineContains: (frame: number) => void;
  
  // ============================================
  // VIEW ACTIONS
  // ============================================
  
  setActiveView: (view: 'frames' | 'layers') => void;
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setPanelHeight: (height: number) => void;
  
  selectKeyframes: (keyframeIds: KeyframeId[]) => void;
  setEditingKeyframe: (keyframeId: KeyframeId | null) => void;
  
  // ============================================
  // EFFECTS ACTIONS
  // ============================================
  
  addEffect: (effectType: string, scope: 'layer' | 'global', layerId?: LayerId) => void;
  removeEffect: (effectId: string) => void;
  reorderEffects: (fromIndex: number, toIndex: number, scope: 'layer' | 'global', layerId?: LayerId) => void;
  toggleEffectScope: (effectId: string) => void;
  
  // ============================================
  // SERIALIZATION
  // ============================================
  
  getSessionData: () => SessionDataV2;
  loadSessionData: (data: SessionDataV2) => void;
}

export const useTimelineStore = create<TimelineState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state - NEW projects start with 1 layer, 1 frame at 12 FPS
    // Note: Migrated v1.0.0 projects preserve their original frame rate
    config: {
      frameRate: 12,
      durationFrames: 1,  // Start with 1 frame
      durationMs: 1000 / 12,
    },
    
    layers: [],  // Initialized in createNewProject()
    layerGroups: [],  // Layer groups for organizational and transform purposes
    globalEffects: [],
    
    view: {
      activeView: 'layers',  // Default to layer view (not frames)
      currentFrame: 0,
      isPlaying: false,
      looping: true,
      activeLayerId: null,
      selectedLayerIds: new Set(),
      selectedKeyframeIds: new Set(),
      zoom: 1,
      scrollX: 0,
      panelHeight: 200,
      editingKeyframeId: null,
    },
    
    // ... action implementations (see Phase 2)
  }))
);
```

### 1.4 Timeline Duration Management

**Purpose:** Timeline length automatically expands to contain all content, with user controls for precise duration editing.

**Auto-Expand Behavior:**

The timeline duration automatically increases when:
1. A content frame is resized past the current timeline end
2. A content frame is dragged past the current timeline end
3. A new content frame is created past the current timeline end
4. A frame is duplicated and placed past the current timeline end
5. A keyframe is added or moved past the current timeline end

```typescript
// Implementation in timelineStore.ts

ensureTimelineContains: (frame: number) => {
  const { config } = get();
  if (frame >= config.durationFrames) {
    // Extend timeline to contain the frame (with small buffer)
    const newDuration = frame + 1;
    set({
      config: {
        ...config,
        durationFrames: newDuration,
        durationMs: (newDuration / config.frameRate) * 1000,
      },
    });
  }
},

// Called from content frame operations:
updateContentFrameTiming: (layerId, frameId, startFrame, durationFrames) => {
  const endFrame = startFrame + durationFrames;
  get().ensureTimelineContains(endFrame - 1);
  // ... update content frame timing
},

addKeyframe: (layerId, trackId, frame, value) => {
  get().ensureTimelineContains(frame);
  // ... add keyframe
},
```

**Frame Duration Dialog:**

Double-clicking a content frame in the timeline opens a dialog for precise duration editing:

```typescript
// New component: src/components/features/FrameDurationDialog.tsx

interface FrameDurationDialogProps {
  contentFrame: ContentFrame;
  layerId: LayerId;
  onClose: () => void;
}

function FrameDurationDialog({ contentFrame, layerId, onClose }: FrameDurationDialogProps) {
  const { frameRate } = useTimelineStore((s) => s.config);
  const updateContentFrameTiming = useTimelineStore((s) => s.updateContentFrameTiming);
  
  const [durationFrames, setDurationFrames] = useState(contentFrame.durationFrames);
  const [durationSeconds, setDurationSeconds] = useState(contentFrame.durationFrames / frameRate);
  
  // Sync between frames and seconds
  const handleFramesChange = (frames: number) => {
    setDurationFrames(frames);
    setDurationSeconds(frames / frameRate);
  };
  
  const handleSecondsChange = (seconds: number) => {
    setDurationSeconds(seconds);
    setDurationFrames(Math.round(seconds * frameRate));
  };
  
  const handleApply = () => {
    updateContentFrameTiming(
      layerId,
      contentFrame.id,
      contentFrame.startFrame,
      durationFrames
    );
    onClose();
  };
  
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Frame Duration</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Frame count input */}
          <div>
            <label className="text-sm text-muted-foreground">Duration (frames)</label>
            <Input
              type="number"
              min={1}
              value={durationFrames}
              onChange={(e) => handleFramesChange(parseInt(e.target.value) || 1)}
            />
            <span className="text-xs text-muted-foreground">at {frameRate} FPS</span>
          </div>
          
          {/* Time input */}
          <div>
            <label className="text-sm text-muted-foreground">Duration (seconds)</label>
            <Input
              type="number"
              min={0.001}
              step={0.001}
              value={durationSeconds.toFixed(3)}
              onChange={(e) => handleSecondsChange(parseFloat(e.target.value) || 0.001)}
            />
          </div>
          
          {/* Extend/add frames buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleFramesChange(durationFrames + 1)}>
              +1 Frame
            </Button>
            <Button variant="outline" onClick={() => handleFramesChange(durationFrames + frameRate)}>
              +1 Second
            </Button>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Usage in ContentFrameBlock.tsx
function ContentFrameBlock({ layerId, frame }) {
  const [showDurationDialog, setShowDurationDialog] = useState(false);
  
  return (
    <>
      <div
        onDoubleClick={() => setShowDurationDialog(true)}
        // ... other props
      >
        {/* Content frame UI */}
      </div>
      
      {showDurationDialog && (
        <FrameDurationDialog
          contentFrame={frame}
          layerId={layerId}
          onClose={() => setShowDurationDialog(false)}
        />
      )}
    </>
  );
}
```

**Frame Rate Conversion:**

When frame rate is changed on an active project, existing content is converted to maintain the same duration in seconds:

```typescript
setFrameRate: (newFps: number, maintainDuration: boolean = true) => {
  const { config, layers } = get();
  const oldFps = config.frameRate;
  
  if (newFps === oldFps) return;
  
  if (maintainDuration) {
    // Calculate the conversion ratio
    const ratio = newFps / oldFps;
    
    // Convert all content frame timings
    const convertedLayers = layers.map((layer) => ({
      ...layer,
      contentFrames: layer.contentFrames.map((cf) => ({
        ...cf,
        startFrame: Math.round(cf.startFrame * ratio),
        durationFrames: Math.max(1, Math.round(cf.durationFrames * ratio)),
      })),
      propertyTracks: layer.propertyTracks.map((track) => ({
        ...track,
        keyframes: track.keyframes.map((kf) => ({
          ...kf,
          frame: Math.round(kf.frame * ratio),
        })),
      })),
    }));
    
    // Convert timeline duration
    const newDurationFrames = Math.round(config.durationFrames * ratio);
    
    set({
      config: {
        frameRate: newFps,
        durationFrames: newDurationFrames,
        durationMs: (newDurationFrames / newFps) * 1000,
      },
      layers: convertedLayers,
    });
    
    // Record for undo
    recordHistoryAction({
      type: 'FRAME_RATE_CHANGE',
      oldFps,
      newFps,
      oldLayers: layers,
      newLayers: convertedLayers,
      oldDuration: config.durationFrames,
      newDuration: newDurationFrames,
    });
  } else {
    // Just change frame rate without converting (duration in seconds changes)
    set({
      config: {
        ...config,
        frameRate: newFps,
        durationMs: (config.durationFrames / newFps) * 1000,
      },
    });
  }
},
```

**Example Conversion:**

| Original (24 FPS) | After (12 FPS) | Duration |
|-------------------|----------------|----------|
| Frame 0-24 | Frame 0-12 | 1 second |
| Frame 24-48 | Frame 12-24 | 1 second |
| Keyframe at 12 | Keyframe at 6 | 0.5s in |

### 1.5 New Project Default State

**Purpose:** Define the starting state for new projects.

```typescript
// In projectStore.ts or timelineStore.ts

function createNewProject(): void {
  // Reset timeline to defaults
  useTimelineStore.setState({
    config: {
      frameRate: 12,
      durationFrames: 1,
      durationMs: 1000 / 12,
    },
    layers: [createDefaultLayer()],
    globalEffects: [],
    view: {
      activeView: 'layers',
      currentFrame: 0,
      isPlaying: false,
      looping: true,
      activeLayerId: 'layer-1' as LayerId,
      selectedLayerIds: new Set(),
      selectedKeyframeIds: new Set(),
      zoom: 1,
      scrollX: 0,
      panelHeight: 200,
      editingKeyframeId: null,
    },
  });
  
  // Reset canvas
  useCanvasStore.getState().clearCells();
}

function createDefaultLayer(): Layer {
  return {
    id: 'layer-1' as LayerId,
    name: 'Layer 1',
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    contentFrames: [{
      id: 'frame-1' as ContentFrameId,
      name: 'Frame 1',
      startFrame: 0,
      durationFrames: 1,
      data: new Map(),
    }],
    propertyTracks: [],
  };
}
```

### 1.6 Integrate Undo/Redo

> **⚠️ Architecture Note:** There is no standalone `historyStore.ts` in this codebase.
> Undo/redo logic lives in **`src/stores/toolStore.ts`** (historyStack, historyPosition, pushToHistory, undo, redo).
> All frame mutations are wrapped by **`src/hooks/useAnimationHistory.ts`** (461 lines), which creates
> typed HistoryAction objects and calls `toolStore.pushToHistory()`. Both files must be updated.

**Modify:** `src/stores/toolStore.ts` — Add new layer action types to the history system
**Migrate:** `src/hooks/useAnimationHistory.ts` → `src/hooks/useTimelineHistory.ts` — New hook wrapping all layer/timeline mutations with undo/redo recording (see §1.6a below)

Add new action types for layer operations:

```typescript
// New history action types
type HistoryAction =
  // Existing canvas actions...
  | { type: 'LAYER_ADD'; layerId: LayerId; layerData: Layer }
  | { type: 'LAYER_REMOVE'; layerId: LayerId; layerData: Layer; index: number }
  | { type: 'LAYER_REORDER'; fromIndex: number; toIndex: number }
  | { type: 'LAYER_RENAME'; layerId: LayerId; oldName: string; newName: string }
  | { type: 'LAYER_VISIBILITY'; layerId: LayerId; oldVisible: boolean; newVisible: boolean }
  | { type: 'CONTENT_FRAME_ADD'; layerId: LayerId; frameId: ContentFrameId; frameData: ContentFrame }
  | { type: 'CONTENT_FRAME_REMOVE'; layerId: LayerId; frameId: ContentFrameId; frameData: ContentFrame }
  | { type: 'CONTENT_FRAME_TIMING'; layerId: LayerId; frameId: ContentFrameId; oldTiming: { start: number; duration: number }; newTiming: { start: number; duration: number } }
  | { type: 'KEYFRAME_ADD'; layerId: LayerId; trackId: PropertyTrackId; keyframeId: KeyframeId; keyframe: Keyframe }
  | { type: 'KEYFRAME_REMOVE'; layerId: LayerId; trackId: PropertyTrackId; keyframeId: KeyframeId; keyframe: Keyframe }
  | { type: 'KEYFRAME_UPDATE'; layerId: LayerId; trackId: PropertyTrackId; keyframeId: KeyframeId; oldValue: Keyframe; newValue: Keyframe }
  | { type: 'PROPERTY_TRACK_ADD'; layerId: LayerId; trackId: PropertyTrackId; propertyPath: PropertyPath }
  | { type: 'PROPERTY_TRACK_REMOVE'; layerId: LayerId; trackId: PropertyTrackId; trackData: PropertyTrack };
```

### 1.6a useTimelineHistory Hook Migration

**Purpose:** Replace `useAnimationHistory.ts` (461 lines) with a new `useTimelineHistory.ts` that wraps all layer/timeline mutations with undo/redo recording against the new `timelineStore`.

**Migrate:** `src/hooks/useAnimationHistory.ts` → `src/hooks/useTimelineHistory.ts`

> **⚠️ Critical:** The existing `useAnimationHistory.ts` wraps every frame mutation (add, delete, reorder, duplicate, copy, paste, clear, etc.) with typed HistoryAction creation and calls `toolStore.pushToHistory()`. The new hook must cover ALL existing operations plus layer-specific ones.

```typescript
// src/hooks/useTimelineHistory.ts
export function useTimelineHistory() {
  const timelineStore = useTimelineStore();
  const pushToHistory = useToolStore((s) => s.pushToHistory);
  
  // Layer operations (NEW)
  const addLayer = useCallback((name?: string) => {
    const layer = timelineStore.addLayer(name);
    pushToHistory({
      type: 'LAYER_ADD',
      layerId: layer.id,
      layerData: structuredClone(layer),
    });
    return layer;
  }, [timelineStore, pushToHistory]);

  const removeLayer = useCallback((layerId: LayerId) => {
    const layer = timelineStore.getLayer(layerId);
    const index = timelineStore.layers.findIndex(l => l.id === layerId);
    timelineStore.removeLayer(layerId);
    pushToHistory({
      type: 'LAYER_REMOVE',
      layerId,
      layerData: structuredClone(layer),
      index,
    });
  }, [timelineStore, pushToHistory]);

  // Content frame operations (replaces existing frame operations)
  const addContentFrame = useCallback((layerId: LayerId, atTime?: number) => {
    const frame = timelineStore.addContentFrame(layerId, atTime);
    pushToHistory({
      type: 'CONTENT_FRAME_ADD',
      layerId,
      frameId: frame.id,
      frameData: structuredClone(frame),
    });
    return frame;
  }, [timelineStore, pushToHistory]);

  // ... remaining frame ops: deleteContentFrame, moveContentFrame, etc.
  // Each wraps the raw timelineStore mutation with a pushToHistory call

  return {
    addLayer, removeLayer,
    addContentFrame, /* deleteContentFrame, moveContentFrame, ... */
  };
}
```

**Migration strategy for consumers:**
1. Components currently importing `useAnimationHistory` should be updated to import `useTimelineHistory`
2. The function signatures change because frame operations now require a `layerId` parameter
3. During Phase 1, `useAnimationHistory` can be kept as a thin wrapper that delegates to `useTimelineHistory` with the active layer ID

### 1.6b animationStore Compatibility Adapter

**Purpose:** The `useAnimationStore` is imported by **47 files** across the codebase. Rather than updating all 47 consumers simultaneously (which would cause a massive, risky PR), we create a backward-compatible adapter that provides the same API surface over the new `timelineStore`.

**Create:** `src/stores/animationStoreAdapter.ts`

```typescript
/**
 * Compatibility adapter: provides the legacy useAnimationStore API
 * backed by the new timelineStore. This allows incremental migration
 * of the 47 files that import useAnimationStore.
 * 
 * Usage: Replace `import { useAnimationStore } from './animationStore'`
 *   with `import { useAnimationStore } from './animationStoreAdapter'`
 * 
 * Consumer code continues to work unchanged.
 */
import { useTimelineStore } from './timelineStore';

export const useAnimationStore = create<LegacyAnimationState>((set, get) => {
  // Derive legacy state from timelineStore
  const timeline = useTimelineStore.getState();

  return {
    // Legacy: frames array → derived from active layer's content frames
    get frames() {
      const tl = useTimelineStore.getState();
      const layer = tl.layers[tl.activeLayerIndex ?? 0];
      return layer?.contentFrames ?? [];
    },
    
    // Legacy: currentFrameIndex → derived from timeline playhead position
    get currentFrameIndex() {
      return useTimelineStore.getState().playbackState.currentFrame;
    },
    
    // Legacy: frameRate
    get frameRate() {
      return useTimelineStore.getState().fps;
    },
    
    // Legacy action: addFrame → delegates to timelineStore.addContentFrame
    addFrame: () => {
      const tl = useTimelineStore.getState();
      const activeLayerId = tl.layers[tl.activeLayerIndex ?? 0]?.id;
      if (activeLayerId) {
        tl.addContentFrame(activeLayerId);
      }
    },
    
    // ... map all ~25 legacy actions to timelineStore equivalents
    
    // Mark adapter usage for tracking migration progress
    __isAdapter: true,
  };
});

// Subscribe to timelineStore changes and trigger adapter re-renders
useTimelineStore.subscribe(() => {
  useAnimationStore.setState({}); // Force re-render of adapter consumers
});
```

**Migration tracking:**

| Priority | File Count | Category | Migration Strategy |
|----------|-----------|----------|-------------------|
| P0 | 5 | Core stores (canvasStore, toolStore, effectsStore, etc.) | Direct migration to timelineStore in Phase 1 |
| P1 | 12 | Hooks (useFrameSync, useAnimationHistory, etc.) | Migrate in Phase 1-2 |
| P2 | 15 | Components (AnimationTimeline, FrameThumbnail, etc.) | Migrate in Phase 3 when rebuilding UI |
| P3 | 15 | Utility/export files (exportDataCollector, generators, etc.) | Migrate in Phase 5-6 |

**Adapter removal timeline:**
- Phase 1: Adapter created, P0 files migrated directly
- Phase 2-3: P1 and P2 files migrated as they are modified
- Phase 5: P3 files migrated during export rewrite
- Phase 6: Adapter removed, `animationStore.ts` deleted, all imports use `timelineStore` directly

### 1.7 Undo/Redo Batching Strategy

**Purpose:** Batch continuous editing operations to prevent history explosion while maintaining intuitive undo behavior.

**Batching Rules:**

| Operation Type | Batching Behavior |
|----------------|-------------------|
| Keyframe value drag | Batch to single undo when mouse released |
| Keyframe frame drag | Batch to single undo when mouse released |
| Easing curve handle drag | Batch to single undo when mouse released |
| Content frame resize drag | Batch to single undo when mouse released |
| Content frame move drag | Batch to single undo when mouse released |
| Drawing operations | Batch per stroke (mousedown → mouseup) |
| Property value slider | Batch to single undo when slider released |
| Property value input | Record on blur or Enter |

**Implementation Pattern:**

```typescript
// Pattern for drag-based operations
interface DragSession {
  startValue: any;
  isActive: boolean;
}

let keyframeDragSession: DragSession | null = null;

function onKeyframeDragStart(keyframeId: KeyframeId) {
  const keyframe = getKeyframe(keyframeId);
  keyframeDragSession = {
    startValue: { ...keyframe },
    isActive: true,
  };
}

function onKeyframeDragMove(keyframeId: KeyframeId, newFrame: number, newValue: number) {
  // Update in real-time for live preview (no history record yet)
  updateKeyframeImmediate(keyframeId, { frame: newFrame, value: newValue });
}

function onKeyframeDragEnd(keyframeId: KeyframeId) {
  if (!keyframeDragSession) return;
  
  const currentKeyframe = getKeyframe(keyframeId);
  
  // Only record history if value actually changed
  if (!deepEqual(keyframeDragSession.startValue, currentKeyframe)) {
    recordHistoryAction({
      type: 'KEYFRAME_UPDATE',
      keyframeId,
      oldValue: keyframeDragSession.startValue,
      newValue: currentKeyframe,
    });
  }
  
  keyframeDragSession = null;
}
```

**Easing Curve Editor Batching:**

```typescript
// Easing curve edits batch to a single undo
let easingDragSession: DragSession | null = null;

function onEasingHandleDragStart(keyframeId: KeyframeId) {
  const keyframe = getKeyframe(keyframeId);
  easingDragSession = {
    startValue: { ...keyframe.easing },
    isActive: true,
  };
}

function onEasingHandleDragMove(keyframeId: KeyframeId, newCurve: EasingCurve) {
  // Live update without history
  updateKeyframeEasingImmediate(keyframeId, newCurve);
}

function onEasingHandleDragEnd(keyframeId: KeyframeId) {
  if (!easingDragSession) return;
  
  const currentEasing = getKeyframe(keyframeId).easing;
  
  if (!deepEqual(easingDragSession.startValue, currentEasing)) {
    recordHistoryAction({
      type: 'KEYFRAME_EASING_UPDATE',
      keyframeId,
      oldEasing: easingDragSession.startValue,
      newEasing: currentEasing,
    });
  }
  
  easingDragSession = null;
}
```

### 1.8 Testing Checkpoint

- [ ] All new type files compile without errors
- [ ] Timeline store creates with initial state (1 layer, 1 frame, 12 FPS)
- [ ] New project creates default layer with correct structure
- [ ] Basic layer add/remove works (no UI yet)
- [ ] Undo/redo framework integrated with new action types
- [ ] Undo batching works (keyframe drag = single undo)
- [ ] Session migration function converts v1 to v2 format
- [ ] Timeline auto-expands when content added past duration
- [ ] Frame rate change converts content to maintain duration in seconds
- [ ] ensureTimelineContains() works correctly

---

## Phase 2: Layer Data Model (Core)

**Duration:** 2-3 weeks  
**Goal:** Implement core layer management with content frames

> **Scope Note:** Advanced features (Layer Groups, Apply-to-All-Layers drawing, Multi-layer Selection,
> Merge Layers) have been moved to **Phase 7: Advanced Layer Features** to reduce MVP complexity.
> This phase focuses on single-layer-at-a-time operations, which is sufficient for initial layer support.

### 2.1 Layer Management Implementation

**File:** `src/stores/timelineStore.ts`

Implement all layer action methods:

```typescript
addLayer: (name?: string) => {
  const id = generateLayerId();
  const layer: Layer = {
    id,
    name: name ?? `Layer ${get().layers.length + 1}`,
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    contentFrames: [],
    propertyTracks: [],
  };
  
  // Check subscription tier limit (centralized check)
  if (!canAddLayer()) {
    showUpgradePrompt('layer_limit');
    return null;
  }
  
  // Record for undo
  recordHistoryAction({ type: 'LAYER_ADD', layerId: id, layerData: layer });
  
  set((state) => ({
    layers: [...state.layers, layer],
    view: { ...state.view, activeLayerId: id },
  }));
  
  return id;
},
```

**Centralized Layer Limit Check:**

All layer creation paths must go through `canAddLayer()`. This includes:
- `addLayer()` (manual)
- `duplicateLayer()` (manual)
- `pasteLayer()` (clipboard)
- `importSession()` (file load - silently truncate excess layers)
- MCP `add_layer` tool (return error response)
- Generator `applyGenerator()` (show upgrade prompt)

```typescript
// src/utils/layerLimits.ts - NEW FILE

import { useTimelineStore } from '../stores/timelineStore';

/**
 * Centralized layer limit check. All layer creation paths MUST call this.
 */
export function canAddLayer(): boolean {
  const layerLimit = getSubscriptionLayerLimit();
  const currentCount = useTimelineStore.getState().layers.length;
  return layerLimit === -1 || currentCount < layerLimit;
}

/**
 * Check if importing N layers would exceed the limit.
 * Returns the maximum number of layers that can be imported.
 */
export function getImportableLayerCount(incomingLayers: number): number {
  const layerLimit = getSubscriptionLayerLimit();
  if (layerLimit === -1) return incomingLayers;
  const currentCount = useTimelineStore.getState().layers.length;
  return Math.max(0, layerLimit - currentCount);
}
```

### 2.2 Subscription Tier Integration

> **⚠️ Architecture Note:** There is no `subscriptionStore.ts` in this codebase.
> The premium submodule uses Stripe hooks and React components directly (e.g., `useStripeSubscription`,
> `PremiumGate`). Layer limits should be added to the existing tier configuration in the premium package's
> hooks and context providers, NOT to a non-existent store.

**Modify:** Premium package tier configuration (add `maxLayers` to the tier definition used by Stripe hooks)

```typescript
// Add layer limit to tier configuration
// Location: packages/premium - update the tier definition interface
interface TierConfig {
  // ...existing fields
  maxLayers: number;  // -1 = unlimited, 5 = free tier
}

// Free tier: 5 layers max
// Pro tier: unlimited layers (-1)
```

**Create:** `src/hooks/useLayerLimit.ts`

```typescript
export function useLayerLimit() {
  // Uses the premium package's existing hooks (not a subscriptionStore)
  const tier = usePremiumTier();  // From packages/premium
  const layerCount = useTimelineStore((s) => s.layers.length);
  
  const maxLayers = tier?.maxLayers ?? 5;  // Default to free tier
  const canAddLayer = maxLayers === -1 || layerCount < maxLayers;
  const remainingLayers = maxLayers === -1 ? Infinity : maxLayers - layerCount;
  
  return { maxLayers, canAddLayer, remainingLayers, layerCount };
}
```

### 2.3 Canvas Store Integration

**Modify:** `src/stores/canvasStore.ts`

The canvas store now represents the **active layer's working canvas**:

```typescript
interface CanvasState {
  // ... existing fields
  
  // NEW: Active layer reference
  activeLayerId: LayerId | null;
  
  // NEW: Track unsaved changes for sync coordination
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  
  // NEW: Sync canvas to/from active layer's content frame
  syncToContentFrame: () => void;
  syncFromContentFrame: () => void;
}
```

### 2.4 Layer Compositing for Rendering

**New File:** `src/utils/layerCompositing.ts`

```typescript
import { Layer, ContentFrame } from '../types/timeline';
import { Cell } from '../types/canvas';

/**
 * Composite all visible layers at a given frame.
 * Returns a Map of cells for rendering.
 * 
 * Rendering order: First layer in array = bottom (rendered first)
 * Cell priority: Top layer's cell wins if non-empty
 */
export function compositeLayersAtFrame(
  layers: Layer[],
  frame: number,
  canvasWidth: number,
  canvasHeight: number
): Map<string, Cell> {
  const result = new Map<string, Cell>();
  
  // Check if any layer is solo'd
  const hasSoloLayer = layers.some((l) => l.solo);
  
  // Iterate layers from bottom to top
  for (const layer of layers) {
    // Skip invisible layers
    if (!layer.visible) continue;
    
    // If any layer is solo'd, only render solo'd layers
    if (hasSoloLayer && !layer.solo) continue;
    
    // Get content frame at this time
    const contentFrame = getContentFrameAtTime(layer, frame);
    if (!contentFrame) continue;
    
    // Get transform values at this frame
    const posX = getPropertyValueAtFrame(layer, 'transform.position.x', frame);
    const posY = getPropertyValueAtFrame(layer, 'transform.position.y', frame);
    const scale = getPropertyValueAtFrame(layer, 'transform.scale', frame);
    const rotation = getPropertyValueAtFrame(layer, 'transform.rotation', frame);
    const opacity = getPropertyValueAtFrame(layer, 'transform.opacity', frame);
    const anchorX = getPropertyValueAtFrame(layer, 'transform.anchorPoint.x', frame);
    const anchorY = getPropertyValueAtFrame(layer, 'transform.anchorPoint.y', frame);
    
    // Skip fully transparent layers
    if (opacity === 0) continue;
    
    // Apply transforms and composite cells
    for (const [coordKey, cell] of contentFrame.data) {
      const [x, y] = coordKey.split(',').map(Number);
      
      // Apply anchor point offset
      const localX = x - anchorX;
      const localY = y - anchorY;
      
      // Apply scale (snap to whole cells)
      const scaledX = Math.round(localX * scale);
      const scaledY = Math.round(localY * scale);
      
      // Apply rotation (in 1° increments, with cell aspect ratio compensation)
      const { rotatedX, rotatedY } = applyRotation(scaledX, scaledY, rotation);
      
      // Apply position offset
      const finalX = rotatedX + anchorX + posX;
      const finalY = rotatedY + anchorY + posY;
      
      // Bounds check
      if (finalX < 0 || finalX >= canvasWidth || finalY < 0 || finalY >= canvasHeight) {
        continue;
      }
      
      const finalKey = `${finalX},${finalY}`;
      
      // Only overwrite if cell has content
      if (cell.char && cell.char !== ' ') {
        result.set(finalKey, {
          ...cell,
          // Apply layer opacity (future: blend with existing cell)
          // For now, just overwrite
        });
      }
    }
  }
  
  return result;
}

/**
 * Get content frame active at a given frame number.
 */
function getContentFrameAtTime(layer: Layer, frame: number): ContentFrame | null {
  for (const cf of layer.contentFrames) {
    if (frame >= cf.startFrame && frame < cf.startFrame + cf.durationFrames) {
      return cf;
    }
  }
  return null;
}

/**
 * Apply rotation at 1° increments around anchor point.
 * Uses same approach as ellipse tool - accounts for cell aspect ratio.
 * Cells are preserved in layer data even when rotated off-canvas;
 * they simply won't render until they're back in view.
 */
function applyRotation(
  x: number, 
  y: number, 
  degrees: number,
  cellAspectRatio: number = getCellAspectRatio()  // Dynamic from font metrics
): { rotatedX: number; rotatedY: number } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  
  // Account for cell aspect ratio (cells are taller than wide)
  // Scale x to make rotation visually correct, then scale back
  const scaledX = x * cellAspectRatio;
  
  // Apply rotation
  const rotatedScaledX = scaledX * cos - y * sin;
  const rotatedY = scaledX * sin + y * cos;
  
  // Scale x back and snap to whole cells
  const rotatedX = Math.round(rotatedScaledX / cellAspectRatio);
  
  return { rotatedX, rotatedY: Math.round(rotatedY) };
}

/**
 * Get cell aspect ratio from current font/typography settings.
 * Falls back to 0.6 (typical monospace ratio) if metrics unavailable.
 * 
 * The aspect ratio is width/height of a single character cell.
 * For IBM VGA 8x16: 8/16 = 0.5
 * For SF Mono at default size: ~0.6
 * For square fonts: 1.0
 */
function getCellAspectRatio(): number {
  const typography = useTypographyStore?.getState?.();
  if (typography?.cellWidth && typography?.cellHeight) {
    return typography.cellWidth / typography.cellHeight;
  }
  return 0.6; // Safe default for most monospace fonts
}

/**
 * Note: Rotation preserves all cell data in the layer.
 * Cells that rotate outside canvas bounds are NOT clipped or deleted.
 * They simply won't render until they rotate back into view.
 * This prevents data loss when animating rotation.
 */
```

### 2.5 Renderer Integration

**Modify:** `src/hooks/useCanvasRenderer.ts`

Update the main render loop to use layer compositing:

```typescript
// Before: Render from canvasStore cells
const cells = useCanvasStore((s) => s.cells);

// After: Composite all layers at current frame
const layers = useTimelineStore((s) => s.layers);
const currentFrame = useTimelineStore((s) => s.view.currentFrame);
const compositedCells = useMemo(
  () => compositeLayersAtFrame(layers, currentFrame, canvasWidth, canvasHeight),
  [layers, currentFrame, canvasWidth, canvasHeight]
);
```

### 2.6 Active Layer Header Display

**Modify:** `src/components/features/Header.tsx`

Add active layer indicator to project title:

```typescript
export function Header() {
  const projectName = useProjectStore((s) => s.name) ?? 'Untitled Project';
  const activeLayer = useTimelineStore((s) => {
    const id = s.view.activeLayerId;
    return s.layers.find((l) => l.id === id);
  });
  
  return (
    <header>
      <h1>
        {projectName}
        {activeLayer && (
          <span className="text-muted-foreground ml-2">
            ({activeLayer.name})
          </span>
        )}
      </h1>
    </header>
  );
}
```

### 2.7 Drawing Tool Active-Layer Routing

**Modify:** `src/stores/toolStore.ts`

All drawing tools operate on the **active layer only** in this phase. The `applyToAllLayers` multi-layer drawing mode is deferred to Phase 7.

```typescript
// Drawing tools always target the active layer
function handleDraw(position: Point) {
  const activeLayer = getActiveLayer();
  if (activeLayer && !activeLayer.locked) {
    applyDrawToLayer(activeLayer.id, position);
  }
}

// Eraser operates on active layer only
function handleErase(position: Point) {
  const activeLayer = getActiveLayer();
  if (activeLayer && !activeLayer.locked) {
    eraseFromLayer(activeLayer.id, position);
  }
}

// Fill operates on active layer only
function handleFill(position: Point) {
  const activeLayer = getActiveLayer();
  if (activeLayer && !activeLayer.locked) {
    fillInLayer(activeLayer.id, position);
  }
}
```

**Locked layer behavior:**
- Drawing on a locked layer shows a toast notification: "Layer is locked"
- All drawing tools check `activeLayer.locked` before any mutation

**Modify:** All drawing tool hooks to route through active layer:
- `src/hooks/useDrawingTool.ts`
- `src/hooks/useCanvasDragAndDrop.ts`
- `src/hooks/usePaintBucket.ts`
- `src/hooks/useEraserTool.ts`

### 2.8 Testing Checkpoint

- [ ] Can add layers (up to 5 on free tier)
- [ ] Can rename, reorder, show/hide, solo, lock layers
- [ ] Active layer indicator shows in header
- [ ] Drawing tools target active layer only
- [ ] Locked layers show toast and reject drawing
- [ ] Invisible layers excluded from render
- [ ] Layer compositing renders correctly (z-order)
- [ ] Content frame gaps show blank canvas
- [ ] Drawing at a content frame gap creates new 1-frame content frame
- [ ] Undo/redo works for all layer operations
- [ ] Solo mode isolates layer rendering
- [ ] Canvas store correctly syncs with active layer's content frame

---

## Phase 3: Timeline UI

**Duration:** 5-6 weeks  
**Goal:** Build complete timeline interface with layers and property tracks

> **⚠️ Duration Note:** Increased from original 3-4 week estimate. This phase introduces 11+ new
> components including the timeline ruler, content frame blocks, keyframe diamonds, easing curve editor,
> frame duration dialog, and frame view panel. Each requires drag-and-drop, keyboard shortcuts, and
> accessibility support. 5-6 weeks accounts for the real UI complexity.

### 3.1 Resizable Bottom Panel

> **⚠️ Architecture Note:** There is no `MainLayout.tsx` in this codebase.
> The main editor layout lives in **`src/pages/EditorPage.tsx`** (214 lines), which uses absolute positioning
> with `left`, `right`, `bottom` panels and a center canvas area. The bottom panel uses the CSS variable
> `--bottom-panel-height` and a `CollapsiblePanel` component.

**Modify:** `src/pages/EditorPage.tsx`

Replace the existing `CollapsiblePanel` toggle with a drag handle for smooth resizing:

```typescript
// New component for resizable panel
export function ResizableTimelinePanel() {
  const panelHeight = useTimelineStore((s) => s.view.panelHeight);
  const setPanelHeight = useTimelineStore((s) => s.setPanelHeight);
  
  const handleDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panelHeight;
    
    const onMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(100, Math.min(600, startHeight + delta));
      setPanelHeight(newHeight);
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelHeight, setPanelHeight]);
  
  return (
    <div 
      className="h-2 cursor-ns-resize bg-border hover:bg-primary/50"
      onMouseDown={handleDrag}
    >
      <div className="w-12 h-1 mx-auto mt-0.5 rounded bg-muted-foreground/50" />
    </div>
  );
}
```

### 3.2 Timeline View Tabs

**New File:** `src/components/features/TimelineTabs.tsx`

```typescript
export function TimelineTabs() {
  const activeView = useTimelineStore((s) => s.view.activeView);
  const setActiveView = useTimelineStore((s) => s.setActiveView);
  
  return (
    <div className="flex border-b">
      <button
        className={cn(
          "px-4 py-2 text-sm font-medium",
          activeView === 'layers' && "border-b-2 border-primary"
        )}
        onClick={() => setActiveView('layers')}
      >
        Timeline
      </button>
      <button
        className={cn(
          "px-4 py-2 text-sm font-medium",
          activeView === 'frames' && "border-b-2 border-primary"
        )}
        onClick={() => setActiveView('frames')}
      >
        Frames (Simple)
      </button>
    </div>
  );
}
```

### 3.3 Layer List Panel

**New File:** `src/components/features/LayerList.tsx`

```typescript
export function LayerList() {
  const layers = useTimelineStore((s) => s.layers);
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  const setActiveLayer = useTimelineStore((s) => s.setActiveLayer);
  const { canAddLayer } = useLayerLimit();
  
  return (
    <div className="w-64 border-r overflow-y-auto">
      {/* Add layer button */}
      <div className="p-2 border-b">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addLayer}
              disabled={!canAddLayer}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Layer
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {canAddLayer ? 'Add new layer' : 'Upgrade to Pro for more layers'}
          </TooltipContent>
        </Tooltip>
      </div>
      
      {/* Layer list (reversed for visual z-order: top = top of list) */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="layers">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {[...layers].reverse().map((layer, index) => (
                <Draggable key={layer.id} draggableId={layer.id} index={index}>
                  {(provided) => (
                    <LayerListItem
                      layer={layer}
                      isActive={layer.id === activeLayerId}
                      onSelect={() => setActiveLayer(layer.id)}
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                    />
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
```

### 3.4 Layer List Item

**New File:** `src/components/features/LayerListItem.tsx`

```typescript
export function LayerListItem({ layer, isActive, onSelect }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(layer.name);
  
  const setLayerVisible = useTimelineStore((s) => s.setLayerVisible);
  const setLayerSolo = useTimelineStore((s) => s.setLayerSolo);
  const setLayerLocked = useTimelineStore((s) => s.setLayerLocked);
  
  // Expand/collapse for property tracks
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      className={cn(
        "border-b p-2",
        isActive && "bg-accent"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        {/* Expand arrow */}
        <button onClick={() => setIsExpanded(!isExpanded)}>
          <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
        </button>
        
        {/* Visibility toggle (eyeball) */}
        <button onClick={() => setLayerVisible(layer.id, !layer.visible)}>
          {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 opacity-50" />}
        </button>
        
        {/* Solo toggle */}
        <button onClick={() => setLayerSolo(layer.id, !layer.solo)}>
          <span className={cn("text-xs font-bold", layer.solo && "text-yellow-500")}>S</span>
        </button>
        
        {/* Lock toggle */}
        <button onClick={() => setLayerLocked(layer.id, !layer.locked)}>
          {layer.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4 opacity-50" />}
        </button>
        
        {/* Layer name (editable on double-click) */}
        {isEditing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { renameLayer(layer.id, name); setIsEditing(false); }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            autoFocus
          />
        ) : (
          <span onDoubleClick={() => setIsEditing(true)}>{layer.name}</span>
        )}
        
        {/* Keyframe indicator (shows if layer has keyframes) */}
        {layer.propertyTracks.some((t) => t.keyframes.length > 0) && (
          <Diamond className="w-3 h-3 text-yellow-500" />
        )}
      </div>
      
      {/* Expanded: Property tracks */}
      {isExpanded && (
        <div className="ml-6 mt-2">
          {layer.propertyTracks.map((track) => (
            <PropertyTrackRow key={track.id} layerId={layer.id} track={track} />
          ))}
          <AddPropertyButton layerId={layer.id} />
        </div>
      )}
    </div>
  );
}
```

### 3.5 Property Track Row

**New File:** `src/components/features/PropertyTrackRow.tsx`

```typescript
export function PropertyTrackRow({ layerId, track }) {
  const definition = PROPERTY_DEFINITIONS[track.propertyPath];
  
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-muted-foreground w-24">{definition.displayName}</span>
      
      {/* Keyframe diamonds will be rendered in the timeline area */}
      <div className="flex-1">
        {/* Timeline ruler synced with main timeline */}
      </div>
      
      {/* Loop toggle */}
      <button onClick={() => setKeyframeLooping(layerId, track.id, !track.loopKeyframes)}>
        <Repeat className={cn("w-3 h-3", track.loopKeyframes && "text-primary")} />
      </button>
    </div>
  );
}
```

### 3.6 Add Property Menu

**New File:** `src/components/features/AddPropertyButton.tsx`

```typescript
export function AddPropertyButton({ layerId }) {
  const layer = useTimelineStore((s) => s.layers.find((l) => l.id === layerId));
  const addPropertyTrack = useTimelineStore((s) => s.addPropertyTrack);
  
  // Get properties not yet added
  const existingPaths = new Set(layer?.propertyTracks.map((t) => t.propertyPath) ?? []);
  const availableProperties = Object.values(PROPERTY_DEFINITIONS)
    .filter((def) => !existingPaths.has(def.path));
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Plus className="w-3 h-3 mr-1" />
          Add Property
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {availableProperties.map((def) => (
          <DropdownMenuItem 
            key={def.path}
            onClick={() => addPropertyTrack(layerId, def.path)}
          >
            {def.displayName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 3.7 Timeline Ruler & Playhead

**New File:** `src/components/features/TimelineRuler.tsx`

```typescript
export function TimelineRuler() {
  const { frameRate, durationFrames } = useTimelineStore((s) => s.config);
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const zoom = useTimelineStore((s) => s.view.zoom);
  const goToFrame = useTimelineStore((s) => s.goToFrame);
  
  const pixelsPerFrame = 10 * zoom;
  const totalWidth = durationFrames * pixelsPerFrame;
  
  // Click to seek
  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = Math.floor(x / pixelsPerFrame);
    goToFrame(Math.max(0, Math.min(durationFrames - 1, frame)));
  };
  
  return (
    <div className="relative h-6 bg-muted" onClick={handleClick}>
      {/* Frame markers */}
      {Array.from({ length: durationFrames }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 h-2 border-l border-border"
          style={{ left: i * pixelsPerFrame }}
        >
          {i % frameRate === 0 && (
            <span className="absolute top-2 text-xs text-muted-foreground">
              {Math.floor(i / frameRate)}s
            </span>
          )}
        </div>
      ))}
      
      {/* Playhead */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-red-500"
        style={{ left: currentFrame * pixelsPerFrame }}
      >
        <div className="absolute -top-1 -left-1.5 w-4 h-4 bg-red-500 rounded-full" />
      </div>
    </div>
  );
}
```

### 3.8 Content Frame Blocks

**New File:** `src/components/features/ContentFrameBlock.tsx`

Draggable, resizable content frame blocks in timeline:

```typescript
export function ContentFrameBlock({ layerId, frame }) {
  const pixelsPerFrame = useTimelineStore((s) => 10 * s.view.zoom);
  const updateContentFrameTiming = useTimelineStore((s) => s.updateContentFrameTiming);
  
  const left = frame.startFrame * pixelsPerFrame;
  const width = frame.durationFrames * pixelsPerFrame;
  
  // Drag to move
  const handleDrag = (e: React.MouseEvent) => {
    // ... drag implementation
  };
  
  // Drag edges to resize
  const handleResizeLeft = (e: React.MouseEvent) => {
    // ... resize left edge
  };
  
  const handleResizeRight = (e: React.MouseEvent) => {
    // ... resize right edge
  };
  
  return (
    <div
      className="absolute h-8 bg-primary/30 border border-primary rounded"
      style={{ left, width }}
    >
      {/* Left resize handle */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize"
        onMouseDown={handleResizeLeft}
      />
      
      {/* Content */}
      <div className="px-2 truncate" onMouseDown={handleDrag}>
        {frame.name}
      </div>
      
      {/* Right resize handle */}
      <div 
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
        onMouseDown={handleResizeRight}
      />
    </div>
  );
}
```

### 3.9 Keyframe Diamonds

**New File:** `src/components/features/KeyframeDiamond.tsx`

```typescript
export function KeyframeDiamond({ layerId, trackId, keyframe, isSelected }) {
  const pixelsPerFrame = useTimelineStore((s) => 10 * s.view.zoom);
  const setEditingKeyframe = useTimelineStore((s) => s.setEditingKeyframe);
  const moveKeyframe = useTimelineStore((s) => s.moveKeyframe);
  
  const left = keyframe.frame * pixelsPerFrame;
  
  // Click to select and open editor
  const handleClick = () => {
    setEditingKeyframe(keyframe.id);
  };
  
  // Drag to move in time
  const handleDrag = (e: React.MouseEvent) => {
    // ... drag implementation
  };
  
  return (
    <div
      className={cn(
        "absolute w-3 h-3 rotate-45 cursor-pointer",
        isSelected ? "bg-yellow-400" : "bg-yellow-600"
      )}
      style={{ left: left - 6, top: 4 }}
      onClick={handleClick}
      onMouseDown={handleDrag}
    />
  );
}
```

### 3.10 Keyframe Editor Panel

**New File:** `src/components/features/KeyframeEditorPanel.tsx`

Right-side panel for editing keyframe properties:

```typescript
export function KeyframeEditorPanel() {
  const editingKeyframeId = useTimelineStore((s) => s.view.editingKeyframeId);
  const keyframeData = useTimelineStore((s) => {
    // Find the keyframe being edited
    for (const layer of s.layers) {
      for (const track of layer.propertyTracks) {
        const kf = track.keyframes.find((k) => k.id === editingKeyframeId);
        if (kf) return { layerId: layer.id, trackId: track.id, keyframe: kf, track };
      }
    }
    return null;
  });
  
  if (!keyframeData) {
    return <div className="w-64 p-4 text-muted-foreground">Select a keyframe to edit</div>;
  }
  
  const { layerId, trackId, keyframe, track } = keyframeData;
  const definition = PROPERTY_DEFINITIONS[track.propertyPath];
  
  return (
    <div className="w-64 border-l p-4 space-y-4">
      <h3 className="font-semibold">{definition.displayName}</h3>
      
      {/* Frame number */}
      <div>
        <label className="text-sm text-muted-foreground">Frame</label>
        <Input
          type="number"
          value={keyframe.frame}
          onChange={(e) => moveKeyframe(layerId, trackId, keyframe.id, parseInt(e.target.value))}
        />
      </div>
      
      {/* Value */}
      <div>
        <label className="text-sm text-muted-foreground">Value</label>
        <Input
          type="number"
          value={keyframe.value as number}
          min={definition.min}
          max={definition.max}
          step={definition.step}
          onChange={(e) => updateKeyframeValue(layerId, trackId, keyframe.id, parseFloat(e.target.value))}
        />
        {definition.unit && <span className="text-xs text-muted-foreground">{definition.unit}</span>}
      </div>
      
      {/* Easing curve editor */}
      <div>
        <label className="text-sm text-muted-foreground">Easing</label>
        <EasingCurveEditor
          value={keyframe.easing}
          onChange={(easing) => updateKeyframeEasing(layerId, trackId, keyframe.id, easing)}
        />
      </div>
      
      {/* Loop toggle */}
      <div className="flex items-center gap-2">
        <Switch
          checked={track.loopKeyframes}
          onCheckedChange={(loop) => setKeyframeLooping(layerId, trackId, loop)}
        />
        <label className="text-sm">Loop keyframes</label>
      </div>
    </div>
  );
}
```

### 3.11 Easing Curve Editor

**New File:** `src/components/features/EasingCurveEditor.tsx`

Visual cubic bezier editor with presets:

```typescript
export function EasingCurveEditor({ value, onChange }) {
  const [customCurve, setCustomCurve] = useState({
    x1: value.x1 ?? 0.42,
    y1: value.y1 ?? 0,
    x2: value.x2 ?? 0.58,
    y2: value.y2 ?? 1,
  });
  
  return (
    <div className="space-y-2">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1">
        {Object.keys(EASING_PRESETS).map((preset) => (
          <Button
            key={preset}
            variant={value.type === preset ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange({ type: preset })}
          >
            {preset}
          </Button>
        ))}
      </div>
      
      {/* Visual curve editor (for custom) */}
      {value.type === 'custom' && (
        <div className="relative w-full h-32 bg-muted rounded border">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Grid */}
            <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" strokeOpacity="0.1" />
            
            {/* Bezier curve */}
            <path
              d={`M 0,100 C ${customCurve.x1 * 100},${100 - customCurve.y1 * 100} ${customCurve.x2 * 100},${100 - customCurve.y2 * 100} 100,0`}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />
            
            {/* Control point handles (draggable) */}
            <circle cx={customCurve.x1 * 100} cy={100 - customCurve.y1 * 100} r="4" fill="hsl(var(--primary))" />
            <circle cx={customCurve.x2 * 100} cy={100 - customCurve.y2 * 100} r="4" fill="hsl(var(--primary))" />
          </svg>
        </div>
      )}
    </div>
  );
}
```

### 3.12 Timecode Display

**New File:** `src/components/features/TimecodeDisplay.tsx`

```typescript
export function TimecodeDisplay() {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const frameRate = useTimelineStore((s) => s.config.frameRate);
  const [format, setFormat] = useState<TimecodeFormat>('timecode');
  
  const formatTimecode = (frame: number): string => {
    switch (format) {
      case 'frames':
        return `Frame ${frame}`;
      case 'seconds':
        return `${(frame / frameRate).toFixed(2)}s`;
      case 'milliseconds':
        return `${Math.round(frame / frameRate * 1000)}ms`;
      case 'timecode':
      default:
        const totalSeconds = Math.floor(frame / frameRate);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const frames = frame % frameRate;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-lg">{formatTimecode(currentFrame)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setFormat('timecode')}>Timecode (MM:SS:FF)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFormat('frames')}>Frames</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFormat('seconds')}>Seconds</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFormat('milliseconds')}>Milliseconds</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

### 3.13 Testing Checkpoint

- [ ] Bottom panel is resizable via drag handle
- [ ] Tabs switch between Frames and Timeline views
- [ ] Layer list shows all layers with correct z-order
- [ ] Layer visibility, solo, lock toggles work
- [ ] Layer names are editable on double-click
- [ ] Layers are reorderable via drag-and-drop
- [ ] Property tracks expand/collapse under layers
- [ ] "+ Add Property" menu shows available properties
- [ ] Content frame blocks display correctly in timeline
- [ ] Content frame edges are draggable to resize duration
- [ ] Keyframe diamonds display on property tracks
- [ ] Clicking keyframe opens editor panel
- [ ] Easing presets apply correctly
- [ ] Custom easing curve is draggable
- [ ] Timecode display shows correct format
- [ ] Playhead is draggable to seek

---

## Phase 4: Keyframe System

**Duration:** 2-3 weeks  
**Goal:** Implement keyframe interpolation, live preview, and anchor point overlay

### 4.1 Keyframe Interpolation

**New File:** `src/utils/keyframeInterpolation.ts`

```typescript
import { Keyframe, EasingCurve, EASING_PRESETS } from '../types/timeline';

/**
 * Interpolate a value between two keyframes at a given frame.
 */
export function interpolateKeyframes(
  keyframes: Keyframe[],
  frame: number,
  loopKeyframes: boolean = false
): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value as number;
  
  // Sort keyframes by frame
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  
  // Handle looping
  if (loopKeyframes) {
    const loopDuration = sorted[sorted.length - 1].frame - sorted[0].frame;
    if (loopDuration > 0) {
      frame = sorted[0].frame + ((frame - sorted[0].frame) % loopDuration);
    }
  }
  
  // Find surrounding keyframes
  const prevKeyframe = sorted.filter((k) => k.frame <= frame).pop();
  const nextKeyframe = sorted.find((k) => k.frame > frame);
  
  // Before first keyframe
  if (!prevKeyframe) return sorted[0].value as number;
  
  // After last keyframe
  if (!nextKeyframe) return sorted[sorted.length - 1].value as number;
  
  // Interpolate
  const t = (frame - prevKeyframe.frame) / (nextKeyframe.frame - prevKeyframe.frame);
  const easedT = applyEasing(t, prevKeyframe.easing);
  
  const prevValue = prevKeyframe.value as number;
  const nextValue = nextKeyframe.value as number;
  
  // For ASCII, snap to whole cells
  return Math.round(prevValue + (nextValue - prevValue) * easedT);
}

/**
 * Apply easing curve to a linear t value (0-1).
 */
function applyEasing(t: number, easing: EasingCurve): number {
  if (easing.type === 'hold') return 0;  // Jump at end
  if (easing.type === 'linear') return t;
  
  // Get bezier control points
  let x1: number, y1: number, x2: number, y2: number;
  
  if (easing.type === 'custom') {
    x1 = easing.x1 ?? 0;
    y1 = easing.y1 ?? 0;
    x2 = easing.x2 ?? 1;
    y2 = easing.y2 ?? 1;
  } else {
    [x1, y1, x2, y2] = EASING_PRESETS[easing.type];
  }
  
  // Solve cubic bezier
  return solveCubicBezier(t, x1, y1, x2, y2);
}

/**
 * Solve cubic bezier curve for y given x.
 * Uses Newton-Raphson method with max 8 iterations.
 * Falls back to bisection if Newton-Raphson fails to converge.
 *
 * Performance: ~0.002ms per call. For animations with 100+ keyframes,
 * consider using presetEasingLUT for common presets.
 */
function solveCubicBezier(x: number, x1: number, y1: number, x2: number, y2: number): number {
  const MAX_ITERATIONS = 8;
  const EPSILON = 1e-6;
  
  // Newton-Raphson to find t for given x
  let t = x; // Initial guess
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const currentX = cubicBezier(t, x1, x2) - x;
    if (Math.abs(currentX) < EPSILON) break;
    const dx = cubicBezierDerivative(t, x1, x2);
    if (Math.abs(dx) < EPSILON) break;
    t -= currentX / dx;
  }
  
  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t));
  
  return cubicBezier(t, y1, y2);
}

function cubicBezier(t: number, p1: number, p2: number): number {
  return 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
}

function cubicBezierDerivative(t: number, p1: number, p2: number): number {
  return 3 * (1 - t) * (1 - t) * p1 + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * Pre-computed lookup table for common easing presets.
 * Avoids Newton-Raphson on high-frequency calls.
 * Each LUT has 256 samples for smooth interpolation.
 */
const EASING_LUT_SIZE = 256;
const easingLUTCache = new Map<string, Float32Array>();

function getEasingLUT(easing: EasingCurve): Float32Array {
  if (easing.type !== 'custom') {
    const cached = easingLUTCache.get(easing.type);
    if (cached) return cached;
    
    const [ex1, ey1, ex2, ey2] = EASING_PRESETS[easing.type];
    const lut = new Float32Array(EASING_LUT_SIZE);
    for (let i = 0; i < EASING_LUT_SIZE; i++) {
      lut[i] = solveCubicBezier(i / (EASING_LUT_SIZE - 1), ex1, ey1, ex2, ey2);
    }
    easingLUTCache.set(easing.type, lut);
    return lut;
  }
  // Custom curves always use Newton-Raphson (not cached)
  return null as any;
}
```

### 4.2 Property Value Provider

**New File:** `src/hooks/usePropertyValues.ts`

```typescript
/**
 * Hook to get all transform property values for a layer at current frame.
 */
export function useLayerTransformValues(layerId: LayerId) {
  const layer = useTimelineStore((s) => s.layers.find((l) => l.id === layerId));
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  
  return useMemo(() => {
    if (!layer) return null;
    
    return {
      positionX: getPropertyValue(layer, 'transform.position.x', currentFrame),
      positionY: getPropertyValue(layer, 'transform.position.y', currentFrame),
      scale: getPropertyValue(layer, 'transform.scale', currentFrame),
      rotation: getPropertyValue(layer, 'transform.rotation', currentFrame),
      opacity: getPropertyValue(layer, 'transform.opacity', currentFrame),
      anchorX: getPropertyValue(layer, 'transform.anchorPoint.x', currentFrame),
      anchorY: getPropertyValue(layer, 'transform.anchorPoint.y', currentFrame),
    };
  }, [layer, currentFrame]);
}

function getPropertyValue(layer: Layer, path: PropertyPath, frame: number): number {
  const track = layer.propertyTracks.find((t) => t.propertyPath === path);
  if (!track || track.keyframes.length === 0) {
    return PROPERTY_DEFINITIONS[path].defaultValue as number;
  }
  return interpolateKeyframes(track.keyframes, frame, track.loopKeyframes);
}
```

### 4.3 Live Preview Updates

**Modify:** `src/components/features/KeyframeEditorPanel.tsx`

Ensure value changes update canvas immediately:

```typescript
// When value changes in editor, it updates store
// Store change triggers re-render of canvas via compositing
const handleValueChange = useCallback((value: number) => {
  updateKeyframe(layerId, trackId, keyframe.id, { value });
  // Canvas will re-composite automatically due to store subscription
}, [layerId, trackId, keyframe.id]);
```

### 4.4 Anchor Point Overlay

**New File:** `src/components/features/AnchorPointOverlay.tsx`

Visual overlay showing anchor point position and motion path:

**Features:**
- Crosshair at current anchor point position
- Motion path dots showing anchor position at each frame over time
- Motion path visualizes easing curves (dots cluster where motion is slow, spread where fast)
- Only visible when editing transform keyframes (position, anchor point)
- Purely visual - not interactive (future: bezier handles for path editing)

```typescript
export function AnchorPointOverlay() {
  const activeLayer = useTimelineStore((s) => {
    const id = s.view.activeLayerId;
    return s.layers.find((l) => l.id === id);
  });
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const durationFrames = useTimelineStore((s) => s.config.durationFrames);
  const editingKeyframeId = useTimelineStore((s) => s.view.editingKeyframeId);
  
  // Check if we're editing a transform property
  const isEditingTransform = useMemo(() => {
    if (!editingKeyframeId || !activeLayer) return false;
    for (const track of activeLayer.propertyTracks) {
      if (track.keyframes.some((k) => k.id === editingKeyframeId)) {
        return track.propertyPath.startsWith('transform.');
      }
    }
    return false;
  }, [editingKeyframeId, activeLayer]);
  
  // Calculate motion path points (one per frame)
  const motionPath = useMemo(() => {
    if (!activeLayer || !isEditingTransform) return [];
    
    const points: { x: number; y: number; frame: number }[] = [];
    for (let f = 0; f < durationFrames; f++) {
      const posX = getPropertyValue(activeLayer, 'transform.position.x', f);
      const posY = getPropertyValue(activeLayer, 'transform.position.y', f);
      const anchorX = getPropertyValue(activeLayer, 'transform.anchorPoint.x', f);
      const anchorY = getPropertyValue(activeLayer, 'transform.anchorPoint.y', f);
      points.push({ x: posX + anchorX, y: posY + anchorY, frame: f });
    }
    return points;
  }, [activeLayer, isEditingTransform, durationFrames]);
  
  if (!activeLayer || !isEditingTransform) return null;
  
  const anchorX = getPropertyValue(activeLayer, 'transform.anchorPoint.x', currentFrame);
  const anchorY = getPropertyValue(activeLayer, 'transform.anchorPoint.y', currentFrame);
  const posX = getPropertyValue(activeLayer, 'transform.position.x', currentFrame);
  const posY = getPropertyValue(activeLayer, 'transform.position.y', currentFrame);
  
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Motion path dots - shows easing via dot density */}
      {motionPath.map((point, idx) => (
        <div
          key={idx}
          className={cn(
            "absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2",
            point.frame === currentFrame ? "bg-yellow-400 w-2 h-2" : "bg-yellow-600/60"
          )}
          style={{
            left: point.x * cellWidth,
            top: point.y * cellHeight,
          }}
        />
      ))}
      
      {/* Crosshair at current anchor point */}
      <div
        className="absolute"
        style={{
          left: (anchorX + posX) * cellWidth,
          top: (anchorY + posY) * cellHeight,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Vertical line */}
        <div className="absolute w-0.5 h-8 bg-yellow-500 -translate-x-1/2 -translate-y-1/2" />
        {/* Horizontal line */}
        <div className="absolute w-8 h-0.5 bg-yellow-500 -translate-x-1/2 -translate-y-1/2" />
        {/* Center dot */}
        <div className="absolute w-3 h-3 rounded-full bg-yellow-400 border-2 border-yellow-600 -translate-x-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
}
```

**Integrate into CanvasOverlay:**

```typescript
// src/components/features/CanvasOverlay.tsx
export function CanvasOverlay() {
  return (
    <>
      {/* ... existing overlays */}
      <AnchorPointOverlay />
    </>
  );
}
```

### 4.5 Keyframe from Side Panel

When users adjust property values in side panels (e.g., transform controls), keyframes should be added automatically if the property is tracked:

**New File:** `src/hooks/useKeyframeableProperty.ts`

```typescript
/**
 * Hook for properties that can be keyframed.
 * Returns the current value and a setter that optionally creates keyframes.
 */
export function useKeyframeableProperty(
  layerId: LayerId,
  propertyPath: PropertyPath
) {
  const currentFrame = useTimelineStore((s) => s.view.currentFrame);
  const layer = useTimelineStore((s) => s.layers.find((l) => l.id === layerId));
  const addKeyframe = useTimelineStore((s) => s.addKeyframe);
  const updateKeyframe = useTimelineStore((s) => s.updateKeyframe);
  
  const track = layer?.propertyTracks.find((t) => t.propertyPath === propertyPath);
  
  const value = useMemo(() => {
    if (!layer) return PROPERTY_DEFINITIONS[propertyPath].defaultValue as number;
    return getPropertyValue(layer, propertyPath, currentFrame);
  }, [layer, propertyPath, currentFrame]);
  
  const setValue = useCallback((newValue: number) => {
    if (!layer) return;
    
    if (track) {
      // Property is tracked - update or create keyframe
      const existingKeyframe = track.keyframes.find((k) => k.frame === currentFrame);
      if (existingKeyframe) {
        updateKeyframe(layerId, track.id, existingKeyframe.id, { value: newValue });
      } else {
        addKeyframe(layerId, track.id, currentFrame, newValue);
      }
    }
    // If property not tracked, could show a prompt to add track
  }, [layer, track, currentFrame, layerId, addKeyframe, updateKeyframe]);
  
  const isKeyframed = track !== undefined;
  const hasKeyframeAtCurrentFrame = track?.keyframes.some((k) => k.frame === currentFrame);
  
  return { value, setValue, isKeyframed, hasKeyframeAtCurrentFrame };
}
```

### 4.6 Keyframe Icon in Side Panels

Add stopwatch/keyframe icon next to keyframeable properties:

```typescript
// Example: Transform controls in side panel
export function TransformControls() {
  const activeLayerId = useTimelineStore((s) => s.view.activeLayerId);
  
  const posX = useKeyframeableProperty(activeLayerId, 'transform.position.x');
  const posY = useKeyframeableProperty(activeLayerId, 'transform.position.y');
  // ... other properties
  
  return (
    <div className="space-y-2">
      <PropertyRow
        label="Position X"
        value={posX.value}
        onChange={posX.setValue}
        isKeyframed={posX.isKeyframed}
        hasKeyframe={posX.hasKeyframeAtCurrentFrame}
        onToggleKeyframe={() => togglePropertyTrack(activeLayerId, 'transform.position.x')}
      />
      {/* ... other properties */}
    </div>
  );
}

function PropertyRow({ label, value, onChange, isKeyframed, hasKeyframe, onToggleKeyframe }) {
  return (
    <div className="flex items-center gap-2">
      {/* Keyframe stopwatch icon */}
      <button onClick={onToggleKeyframe}>
        <Clock className={cn(
          "w-4 h-4",
          isKeyframed ? "text-yellow-500" : "text-muted-foreground"
        )} />
      </button>
      
      <label className="text-sm w-24">{label}</label>
      
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-20"
      />
      
      {/* Diamond indicator if keyframe exists at current frame */}
      {hasKeyframe && <Diamond className="w-3 h-3 text-yellow-500" />}
    </div>
  );
}
```

### 4.7 Testing Checkpoint

- [ ] Keyframe interpolation calculates correct values
- [ ] All easing presets produce expected curves
- [ ] Custom bezier curves are draggable and apply correctly
- [ ] Loop keyframes repeat pattern correctly
- [ ] Live preview updates canvas when editing keyframe values
- [ ] Anchor point overlay shows at correct position
- [ ] Anchor point overlay visible when editing ANY transform keyframe
- [ ] Motion path dots show position at each frame
- [ ] Motion path dots density reflects easing (clustered = slow, spread = fast)
- [ ] Rotation works at 1° increments
- [ ] Rotation accounts for cell aspect ratio (looks correct)
- [ ] Cells rotated off-canvas are preserved (not deleted)
- [ ] Cells rotated back into canvas re-appear
- [ ] Keyframe icons appear in side panels for tracked properties
- [ ] Clicking keyframe icon adds property track to timeline
- [ ] Editing value in side panel creates/updates keyframe at current frame
- [ ] Layer playback maintains 60fps with pre-computed frames
- [ ] Onion skinning "current layer" mode shows only active layer ghosts
- [ ] Onion skinning "all layers" mode shows composited ghosts

### 4.8 Layer Playback Store Architecture (Performance Optimization)

**Purpose:** Achieve high-performance playback with multi-layer compositing by pre-computing frames and using a dedicated non-React store, mirroring the existing `playbackOnlyStore` pattern.

**Analysis of Current Pattern:**

The existing `playbackOnlyStore` (see `src/stores/playbackOnlyStore.ts`) uses:
1. Non-Zustand store with manual subscriber management
2. Frame snapshot taken at playback start
3. `requestAnimationFrame` loop in `useOptimizedPlayback`
4. Direct canvas rendering via `renderFrameDirectly`
5. No React state updates during playback

**New Pattern for Layers:**

```typescript
// src/stores/layerPlaybackStore.ts - NEW FILE

interface LayerPlaybackState {
  isActive: boolean;
  currentFrame: number;
  
  // Pre-composited frames (computed once at playback start)
  compositedFrames: Map<string, Cell>[];  // One per timeline frame
  
  // Performance metrics
  startTime: number;
  lastFrameTime: number;
}

let playbackState: LayerPlaybackState = {
  isActive: false,
  currentFrame: 0,
  compositedFrames: [],
  startTime: 0,
  lastFrameTime: 0,
};

const subscribers = new Set<() => void>();

export const layerPlaybackStore = {
  /**
   * Start layer playback.
   * Pre-computes all composited frames for smooth playback.
   */
  start: (
    layers: Layer[],
    durationFrames: number,
    canvasWidth: number,
    canvasHeight: number,
    initialFrame: number = 0
  ) => {
    // Pre-compute all composited frames
    const compositedFrames: Map<string, Cell>[] = [];
    
    for (let f = 0; f < durationFrames; f++) {
      compositedFrames.push(
        compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight)
      );
    }
    
    playbackState = {
      isActive: true,
      currentFrame: initialFrame,
      compositedFrames,
      startTime: performance.now(),
      lastFrameTime: performance.now(),
    };
    
    emit();
  },
  
  /**
   * Get composited cells for current frame (direct render).
   */
  getCurrentFrameCells: (): Map<string, Cell> | null => {
    if (!playbackState.isActive) return null;
    return playbackState.compositedFrames[playbackState.currentFrame] ?? null;
  },
  
  goToFrame: (frame: number) => {
    if (frame < 0 || frame >= playbackState.compositedFrames.length) return;
    playbackState = { ...playbackState, currentFrame: frame, lastFrameTime: performance.now() };
    emit();
  },
  
  stop: () => {
    playbackState = { ...playbackState, isActive: false };
    emit();
  },
  
  isActive: () => playbackState.isActive,
  getState: () => ({ ...playbackState }),
  
  subscribe: (listener: () => void) => {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  },
  
  getSnapshot: () => playbackState,
};

function emit() {
  subscribers.forEach(l => { try { l(); } catch {} });
}
```

**Updated Optimized Playback Hook:**

```typescript
// Modify src/hooks/useOptimizedPlayback.ts

export const useOptimizedLayerPlayback = () => {
  const animationRef = useRef<number | undefined>(undefined);
  const renderSettingsRef = useRef<DirectRenderSettings | null>(null);
  
  const { layers, config, view } = useTimelineStore.getState();
  const { canvasRef } = useCanvasContext();
  
  const startOptimizedPlayback = useCallback(() => {
    const { width, height } = useCanvasStore.getState();
    const { currentFrame } = useTimelineStore.getState().view;
    
    // Pre-compute all composited frames
    layerPlaybackStore.start(
      layers,
      config.durationFrames,
      width,
      height,
      currentFrame
    );
    
    // Initialize render settings
    renderSettingsRef.current = initializeRenderSettings();
    
    // Set playback mode
    useToolStore.getState().setPlaybackMode(true);
    
    // Render initial frame
    const cells = layerPlaybackStore.getCurrentFrameCells();
    if (cells) {
      renderCellsDirectly(cells, canvasRef, renderSettingsRef.current);
    }
    
    // Start playback loop
    let currentIndex = currentFrame;
    let lastFrameTime = performance.now();
    const msPerFrame = 1000 / config.frameRate;
    
    const playbackLoop = (timestamp: number) => {
      if (!layerPlaybackStore.isActive()) return;
      
      const elapsed = timestamp - lastFrameTime;
      
      if (elapsed >= msPerFrame) {
        const { looping } = useTimelineStore.getState().view;
        const atLastFrame = currentIndex >= config.durationFrames - 1;
        
        if (atLastFrame) {
          if (looping) {
            currentIndex = 0;
          } else {
            stopOptimizedPlayback();
            return;
          }
        } else {
          currentIndex += 1;
        }
        
        layerPlaybackStore.goToFrame(currentIndex);
        
        const cells = layerPlaybackStore.getCurrentFrameCells();
        if (cells) {
          renderCellsDirectly(cells, canvasRef, renderSettingsRef.current!);
        }
        
        lastFrameTime = timestamp;
      }
      
      animationRef.current = requestAnimationFrame(playbackLoop);
    };
    
    animationRef.current = requestAnimationFrame(playbackLoop);
  }, [layers, config, canvasRef]);
  
  // ... stopOptimizedPlayback, toggleOptimizedPlayback similar to existing
};
```

**Performance Optimizations:**

1. **Frame Pre-computation**: All layers composited once at playback start
2. **Memory Trade-off**: Uses more memory (one composited Map per frame) but zero per-frame computation
3. **Large Animation Handling**: For animations exceeding `MAX_PRECOMPUTE_FRAMES`, switch to on-demand compositing with LRU cache
4. **Keyframe Change Detection**: If user edits during paused playback, invalidate cache

**Memory Configuration:**

```typescript
// src/config/playbackConfig.ts

/** Maximum frames to pre-compute at playback start.
 *  Above this threshold, switch to on-demand compositing with LRU cache.
 *  Estimated memory per frame: ~2KB for 80x24 canvas, ~20KB for 200x100 canvas.
 */
export const MAX_PRECOMPUTE_FRAMES = 500;

/** LRU cache size for on-demand compositing (large animations). */
export const LRU_CACHE_SIZE = 100;

/** Estimated memory budget for pre-computed frames (in bytes). */
export const PRECOMPUTE_MEMORY_BUDGET = 50 * 1024 * 1024; // 50 MB
```

**Updated start() with threshold:**

```typescript
start: (layers, durationFrames, canvasWidth, canvasHeight, initialFrame = 0) => {
  if (durationFrames <= MAX_PRECOMPUTE_FRAMES) {
    // Pre-compute all frames (fast playback, higher memory)
    const compositedFrames = [];
    for (let f = 0; f < durationFrames; f++) {
      compositedFrames.push(compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight));
    }
    playbackState = { ...playbackState, isActive: true, compositedFrames, mode: 'precomputed' };
  } else {
    // On-demand with LRU cache (lower memory, slight per-frame overhead)
    const lruCache = new LRUCache<number, Map<string, Cell>>(LRU_CACHE_SIZE);
    playbackState = { ...playbackState, isActive: true, lruCache, layers, mode: 'on-demand' };
  }
  emit();
},
```

### 4.9 Onion Skinning Layer Support

**Purpose:** Extend existing onion skinning to work with the layer system, with a toggle for "current layer only" vs "all layers".

**Modify:** `src/stores/toolStore.ts`

```typescript
interface ToolState {
  // ... existing onion skinning fields
  onionSkinEnabled: boolean;
  onionSkinFramesBefore: number;
  onionSkinFramesAfter: number;
  onionSkinOpacity: number;
  
  // NEW: Layer mode for onion skinning
  onionSkinLayerMode: 'current' | 'all';
}
```

**Onion Skinning Options UI:**

```typescript
// In onion skinning settings panel
function OnionSkinSettings() {
  const { 
    onionSkinEnabled, 
    onionSkinLayerMode, 
    setOnionSkinLayerMode 
  } = useToolStore();
  
  return (
    <div className="space-y-2">
      {/* Existing onion skin controls */}
      
      {/* NEW: Layer mode toggle */}
      <div className="flex items-center gap-2">
        <label className="text-sm">Show:</label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {onionSkinLayerMode === 'current' ? 'Current Layer' : 'All Layers'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setOnionSkinLayerMode('current')}>
              Current Layer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOnionSkinLayerMode('all')}>
              All Layers
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
```

**Onion Skin Rendering:**

```typescript
// Modify onion skinning renderer
function renderOnionSkins(
  currentFrame: number,
  framesBefore: number,
  framesAfter: number,
  opacity: number,
  layerMode: 'current' | 'all'
) {
  const { layers, view } = useTimelineStore.getState();
  const { width, height } = useCanvasStore.getState();
  
  const onionFrames: { frame: number; cells: Map<string, Cell>; tint: 'before' | 'after' }[] = [];
  
  // Collect frames before
  for (let f = currentFrame - framesBefore; f < currentFrame; f++) {
    if (f < 0) continue;
    
    let cells: Map<string, Cell>;
    if (layerMode === 'current') {
      // Current layer only
      const activeLayer = layers.find(l => l.id === view.activeLayerId);
      if (activeLayer) {
        cells = getLayerCellsAtFrame(activeLayer, f, width, height);
      } else {
        continue;
      }
    } else {
      // All layers composited
      cells = compositeLayersAtFrame(layers, f, width, height);
    }
    
    onionFrames.push({ frame: f, cells, tint: 'before' });
  }
  
  // Collect frames after
  for (let f = currentFrame + 1; f <= currentFrame + framesAfter; f++) {
    const durationFrames = useTimelineStore.getState().config.durationFrames;
    if (f >= durationFrames) continue;
    
    let cells: Map<string, Cell>;
    if (layerMode === 'current') {
      const activeLayer = layers.find(l => l.id === view.activeLayerId);
      if (activeLayer) {
        cells = getLayerCellsAtFrame(activeLayer, f, width, height);
      } else {
        continue;
      }
    } else {
      cells = compositeLayersAtFrame(layers, f, width, height);
    }
    
    onionFrames.push({ frame: f, cells, tint: 'after' });
  }
  
  // Render with opacity and tint
  for (const { frame, cells, tint } of onionFrames) {
    const distance = Math.abs(frame - currentFrame);
    const frameOpacity = opacity * (1 - distance / (framesBefore + framesAfter + 1));
    const tintColor = tint === 'before' ? '#ff6b6b' : '#4ecdc4';  // Red for before, cyan for after
    
    renderCellsWithTint(cells, frameOpacity, tintColor);
  }
}
```

---

## Phase 5: Export & Migration

**Duration:** 2-3 weeks  
**Goal:** Update all export formats, session format v2, and backward compatibility

> **ℹ️ Coordinate Space Note (from Phase 4):** Export operations read from `compositeLayersAtFrame()` which
> produces screen-space output. No inverse transforms needed for export — the compositing engine handles
> the forward transform. Session serialization reads from `canvasStore.cells` (local space) directly via
> `contentFrame.data`, which is correct since transforms are stored separately as keyframes.

### 5.1 Export Data Collector Updates

**Modify:** `src/utils/exportDataCollector.ts`

```typescript
export function collectExportData(): ExportDataBundle {
  const timelineState = useTimelineStore.getState();
  const canvasState = useCanvasStore.getState();
  
  return {
    // ... existing metadata fields
    
    // NEW: Timeline configuration
    timeline: {
      frameRate: timelineState.config.frameRate,
      durationFrames: timelineState.config.durationFrames,
      looping: timelineState.view.looping,
    },
    
    // NEW: Layers data
    layers: timelineState.layers,
    
    // NEW: Global effects
    globalEffects: timelineState.globalEffects,
    
    // COMPUTED: Frames for backward compatibility with export formats
    frames: computeFramesFromLayers(
      timelineState.layers,
      timelineState.config.frameRate,
      timelineState.config.durationFrames,
      canvasState.width,
      canvasState.height
    ),
    
    // ... other existing fields
  };
}

/**
 * Compute flattened frames from layer composition.
 * Used for video/image exports that need per-frame data.
 */
function computeFramesFromLayers(
  layers: Layer[],
  frameRate: number,
  durationFrames: number,
  canvasWidth: number,
  canvasHeight: number
): Frame[] {
  const frames: Frame[] = [];
  
  for (let f = 0; f < durationFrames; f++) {
    const compositedCells = compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight);
    
    frames.push({
      id: `frame-${f}` as FrameId,
      name: `Frame ${f}`,
      duration: 1000 / frameRate,  // Convert frame to ms
      data: compositedCells,
    });
  }
  
  // Optimize: merge consecutive identical frames
  return mergeIdenticalFrames(frames);
}
```

### 5.2 Video Export Updates

**Modify:** `src/utils/videoExporter.ts`

Video export now uses composited frames:

```typescript
export async function exportVideo(settings: VideoExportSettings): Promise<Blob> {
  const { layers, config, canvasWidth, canvasHeight } = collectExportData();
  
  // Render each frame by compositing layers
  const frameCanvases: HTMLCanvasElement[] = [];
  
  for (let f = 0; f < config.durationFrames; f++) {
    const compositedCells = compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight);
    const canvas = renderCellsToCanvas(compositedCells, settings);
    frameCanvases.push(canvas);
  }
  
  // Encode frames to video
  // ... existing FFmpeg or WebCodecs logic
}
```

### 5.3 Image Export Updates

**Modify:** `src/utils/exportRenderer.ts`

Image export composites all visible layers:

```typescript
export function exportImage(format: 'png' | 'jpeg', settings: ImageExportSettings): string {
  const { layers, config, canvasWidth, canvasHeight } = collectExportData();
  const currentFrame = useTimelineStore.getState().view.currentFrame;
  
  // Composite layers at current frame
  const compositedCells = compositeLayersAtFrame(layers, currentFrame, canvasWidth, canvasHeight);
  
  // Render to canvas
  const canvas = renderCellsToCanvas(compositedCells, settings);
  
  return canvas.toDataURL(`image/${format}`, settings.quality);
}
```

### 5.4 Session Export (Save)

**Modify:** `src/utils/sessionExporter.ts`

Always save in v2.0.0 format:

```typescript
export function exportSession(): SessionDataV2 {
  const timelineState = useTimelineStore.getState();
  const canvasState = useCanvasStore.getState();
  const toolState = useToolStore.getState();
  // ... other stores
  
  const sessionData: SessionDataV2 = {
    version: '2.0.0',
    
    name: useProjectStore.getState().name,
    description: useProjectStore.getState().description,
    
    metadata: {
      exportedAt: new Date().toISOString(),
      exportVersion: VERSION,
      userAgent: navigator.userAgent,
    },
    
    canvas: {
      width: canvasState.width,
      height: canvasState.height,
      canvasBackgroundColor: canvasState.canvasBackgroundColor,
      showGrid: canvasState.showGrid,
    },
    
    timeline: {
      frameRate: timelineState.config.frameRate,
      durationFrames: timelineState.config.durationFrames,
      looping: timelineState.view.looping,
    },
    
    layers: serializeLayers(timelineState.layers),
    
    // NEW: Layer groups
    layerGroups: serializeLayerGroups(timelineState.layerGroups ?? []),
    
    globalEffects: serializeEffects(timelineState.globalEffects),
    
    // Preserved fields
    tools: serializeToolState(toolState),
    ui: serializeUIState(),
    typography: serializeTypography(),
    palettes: serializePalettes(),
    characterPalettes: serializeCharacterPalettes(),
  };
  
  return sessionData;
}

function serializeLayers(layers: Layer[]): SessionLayerV2[] {
  return layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    solo: layer.solo,
    locked: layer.locked,
    opacity: layer.opacity,
    parentGroupId: layer.parentGroupId,  // Include group reference
    contentFrames: layer.contentFrames.map((cf) => ({
      id: cf.id,
      name: cf.name,
      startFrame: cf.startFrame,
      durationFrames: cf.durationFrames,
      data: Object.fromEntries(cf.data),  // Map → Object for JSON
    })),
    propertyTracks: layer.propertyTracks.map((track) => ({
      id: track.id,
      propertyPath: track.propertyPath,
      loopKeyframes: track.loopKeyframes,
      keyframes: track.keyframes.map((kf) => ({
        id: kf.id,
        frame: kf.frame,
        value: kf.value,
        easing: kf.easing,
      })),
    })),
  }));
}

/**
 * Serialize layer groups for session files.
 */
function serializeLayerGroups(groups: LayerGroup[]): SessionLayerGroupV2[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    childLayerIds: group.childLayerIds,
    visible: group.visible,
    solo: group.solo,
    locked: group.locked,
    collapsed: group.collapsed,
    propertyTracks: group.propertyTracks.map((track) => ({
      id: track.id,
      propertyPath: track.propertyPath,
      loopKeyframes: track.loopKeyframes,
      keyframes: track.keyframes.map((kf) => ({
        id: kf.id,
        frame: kf.frame,
        value: kf.value,
        easing: kf.easing,
      })),
    })),
  }));
}

/**
 * Deserialize layer groups from session files.
 */
function deserializeLayerGroups(groups: SessionLayerGroupV2[] | undefined): LayerGroup[] {
  if (!groups) return [];
  
  return groups.map((group) => ({
    id: group.id as LayerGroupId,
    name: group.name,
    childLayerIds: group.childLayerIds.map((id) => id as LayerId),
    visible: group.visible,
    solo: group.solo,
    locked: group.locked,
    collapsed: group.collapsed,
    propertyTracks: group.propertyTracks.map((track) => ({
      id: track.id as PropertyTrackId,
      propertyPath: track.propertyPath as PropertyPath,
      loopKeyframes: track.loopKeyframes,
      keyframes: track.keyframes.map((kf) => ({
        id: kf.id as KeyframeId,
        frame: kf.frame,
        value: kf.value,
        easing: kf.easing,
      })),
    })),
  }));
}
```

### 5.5 Session Import (Load)

**Modify:** `src/utils/sessionImporter.ts`

Handle both v1 and v2 formats:

```typescript
export async function importSession(fileOrData: File | string | object): Promise<void> {
  let rawData: unknown;
  
  if (fileOrData instanceof File) {
    rawData = JSON.parse(await fileOrData.text());
  } else if (typeof fileOrData === 'string') {
    rawData = JSON.parse(fileOrData);
  } else {
    rawData = fileOrData;
  }
  
  // Detect version
  const version = detectSessionVersion(rawData);
  
  let sessionV2: SessionDataV2;
  
  if (version === '1.0.0') {
    // Migrate v1 to v2
    sessionV2 = migrateV1ToV2(rawData as SessionData);
    console.log('Migrated v1.0.0 session to v2.0.0 format');
  } else if (version === '2.0.0') {
    sessionV2 = rawData as SessionDataV2;
  } else {
    throw new Error('Unknown session format version');
  }
  
  // Load into stores
  loadSessionIntoStores(sessionV2);
}

function loadSessionIntoStores(session: SessionDataV2): void {
  // Load canvas settings
  useCanvasStore.getState().setDimensions(session.canvas.width, session.canvas.height);
  useCanvasStore.getState().setBackgroundColor(session.canvas.canvasBackgroundColor);
  useCanvasStore.getState().setShowGrid(session.canvas.showGrid);
  
  // Load timeline configuration
  useTimelineStore.getState().setFrameRate(session.timeline.frameRate, false);  // Don't convert, just set
  useTimelineStore.getState().setDuration(session.timeline.durationFrames);
  useTimelineStore.getState().setLooping(session.timeline.looping);
  
  // Load layers
  const layers = deserializeLayers(session.layers);
  useTimelineStore.setState({ layers });
  
  // Load layer groups
  if (session.layerGroups) {
    const groups = deserializeLayerGroups(session.layerGroups);
    useTimelineStore.setState({ layerGroups: groups });
  }
  
  // Load global effects
  if (session.globalEffects) {
    const effects = deserializeEffects(session.globalEffects);
    useTimelineStore.setState({ globalEffects: effects });
  }
  
  // Load preserved state
  if (session.tools) loadToolState(session.tools);
  if (session.ui) loadUIState(session.ui);
  if (session.typography) loadTypography(session.typography);
  if (session.palettes) loadPalettes(session.palettes);
  if (session.characterPalettes) loadCharacterPalettes(session.characterPalettes);
  
  // Set first layer as active
  if (layers.length > 0) {
    useTimelineStore.getState().setActiveLayer(layers[0].id);
  }
  
  // Load first layer's content into canvas
  useCanvasStore.getState().syncFromContentFrame();
}
```

### 5.6 Cloud Storage Updates

**Modify:** `packages/premium/src/services/projectService.ts`

Cloud storage continues to use `canvas_data` column with SessionDataV2:

```typescript
export async function saveProject(project: CloudProject): Promise<void> {
  const sessionData = exportSession();  // Returns SessionDataV2
  
  // Compress if large
  const jsonString = JSON.stringify(sessionData);
  const data = jsonString.length > 100 * 1024
    ? await compressData(jsonString)
    : jsonString;
  
  const { error } = await supabase
    .from('projects')
    .update({
      name: sessionData.name,
      canvas_data: data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', project.id);
  
  if (error) throw error;
}

export async function loadProject(projectId: string): Promise<void> {
  const { data, error } = await supabase
    .from('projects')
    .select('canvas_data')
    .eq('id', projectId)
    .single();
  
  if (error) throw error;
  
  // Decompress if needed
  let sessionData = data.canvas_data;
  if (typeof sessionData === 'string' && sessionData.startsWith('H4sI')) {
    sessionData = JSON.parse(await decompressData(sessionData));
  }
  
  // Import handles version detection and migration
  await importSession(sessionData);
}
```

### 5.7 Community Preview Updates

**Modify:** `packages/premium/src/utils/previewGenerator.ts`

Generate composited preview for community gallery:

```typescript
export async function generateProjectPreview(projectId: string): Promise<string> {
  const { layers, config, canvasWidth, canvasHeight } = collectExportData();
  
  // Composite first frame
  const compositedCells = compositeLayersAtFrame(layers, 0, canvasWidth, canvasHeight);
  
  // Render to canvas at preview size
  const canvas = renderCellsToCanvas(compositedCells, {
    width: 1000,
    height: 1000,
    quality: 0.9,
  });
  
  // Convert to WebP
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
  
  // Upload to storage
  const path = `project-previews/${projectId}/preview.webp`;
  await uploadToStorage(path, blob);
  
  return getPublicUrl(path);
}
```

### 5.8 HTML Export Updates

**Modify:** HTML export to handle layer data:

```typescript
export function exportHTML(settings: HTMLExportSettings): string {
  const { layers, config, canvasWidth, canvasHeight } = collectExportData();
  
  // Pre-compute all frames
  const frames: { data: string; duration: number }[] = [];
  
  for (let f = 0; f < config.durationFrames; f++) {
    const compositedCells = compositeLayersAtFrame(layers, f, canvasWidth, canvasHeight);
    frames.push({
      data: serializeCellsForHTML(compositedCells),
      duration: 1000 / config.frameRate,
    });
  }
  
  // Generate HTML with embedded player
  return generateHTMLTemplate(frames, settings);
}
```

### 5.9 Testing Checkpoint

- [ ] Session exports save in v2.0.0 format
- [ ] Session imports detect v1.0.0 and migrate correctly
- [ ] Session imports load v2.0.0 format correctly
- [ ] Cloud save works with new format (compression if needed)
- [ ] Cloud load works with both old and new projects
- [ ] Image export composites all layers
- [ ] Video export renders all frames from layers
- [ ] HTML export plays back correctly
- [ ] Community preview shows composited first frame
- [ ] All 10+ export formats work correctly

---

## Phase 6: Integration

**Duration:** 2-3 weeks  
**Goal:** Effects system, MCP protocol v2, and polish

> **ℹ️ Coordinate Space Note (from Phase 4):** Layer-scoped effects that read/write cell data from
> `canvasStore.cells` are operating in local space. If an effect needs to sample from the composited
> (screen-space) view, it must use `compositeLayersAtFrame()`. If it writes cells, no inverse transform
> is needed (writing to local space is correct). The `transformCellMapToLocal()` and
> `transformCellMapToScreen()` utilities in `src/utils/layerTransformUtils.ts` are available if needed.
> Generator outputs create new layers with identity transforms, so no coordinate conversion is needed.

### 6.1 Effects System Layer Integration

**Modify:** `src/stores/effectsStore.ts`

Add layer targeting and effect ordering:

```typescript
interface EffectsState {
  // Layer-specific effects (keyed by layerId)
  layerEffects: Map<LayerId, EffectInstance[]>;
  
  // Global effects (apply to composited result)
  globalEffects: EffectInstance[];
  
  // Actions
  addEffect: (effectType: string, scope: EffectScope, layerId?: LayerId) => void;
  removeEffect: (effectId: string) => void;
  reorderEffects: (effectId: string, newIndex: number) => void;
  toggleEffectScope: (effectId: string) => void;  // Switch between layer/global
}
```

**Effect Application Order:**

1. Per-layer effects (in order) for each layer
2. Layer compositing
3. Global effects (in order) on composited result

### 6.2 Effects Timeline Track

When an effect is layer-scoped, its keyframeable properties appear in the layer's property tracks:

```typescript
// In LayerListItem.tsx, show effect properties when expanded
{layer.propertyTracks
  .filter((t) => t.propertyPath.startsWith('effect.'))
  .map((track) => (
    <PropertyTrackRow key={track.id} layerId={layer.id} track={track} />
  ))
}
```

Global effects appear in a separate "Effects" section at the bottom of the timeline:

```typescript
// In TimelinePanel.tsx
{globalEffects.length > 0 && (
  <div className="border-t">
    <h3 className="text-sm font-semibold p-2">Global Effects</h3>
    {globalEffects.map((effect) => (
      <EffectTrackRow key={effect.id} effect={effect} />
    ))}
  </div>
)}
```

### 6.3 Generator Integration

**Purpose:** Generators always create new layers with their output. Each generator run produces a new layer named after the generator type.

**Current Generator Types:**
- Radio Waves
- Turbulent Noise
- Particle Physics
- Rain Drops
- Digital Rain (Matrix)

**Behavioral Changes:**

1. **Always Creates New Layer**: Generators no longer have "overwrite" or "append" modes. Each run creates a fresh layer.

2. **Layer Naming**: Auto-incrementing names like "Radio Waves 1", "Digital Rain 2"

3. **Insert Position**: New generator layer is inserted **above the currently selected layer** (or at top if nothing selected)

**Store Updates:**

```typescript
// Modify src/stores/generatorStore.ts

interface GeneratorState {
  // ... existing fields
  
  // REMOVED: importMode (no longer needed - always creates new layer)
  
  // Track generator instance counts for naming
  generatorCounts: Record<GeneratorId, number>;
}

applyGenerator: async () => {
  const { activeGeneratorId, convertedFrames, generatorCounts } = get();
  const timelineStore = useTimelineStore.getState();
  
  if (!activeGeneratorId || convertedFrames.length === 0) return false;
  
  // Increment count for naming
  const count = (generatorCounts[activeGeneratorId] ?? 0) + 1;
  set((s) => ({
    generatorCounts: { ...s.generatorCounts, [activeGeneratorId]: count },
  }));
  
  // Generate layer name
  const generatorNames: Record<GeneratorId, string> = {
    'radio-waves': 'Radio Waves',
    'turbulent-noise': 'Turbulent Noise',
    'particle-physics': 'Particle Physics',
    'rain-drops': 'Rain Drops',
    'digital-rain': 'Digital Rain',
  };
  const layerName = `${generatorNames[activeGeneratorId]} ${count}`;
  
  // Convert frames to content frames
  const { frameRate } = timelineStore.config;
  const contentFrames: ContentFrame[] = convertedFrames.map((frame, idx) => ({
    id: generateContentFrameId(),
    name: `${layerName} - Frame ${idx + 1}`,
    startFrame: idx,
    durationFrames: 1,
    data: frame.data,
  }));
  
  // Create new layer
  const newLayer: Layer = {
    id: generateLayerId(),
    name: layerName,
    visible: true,
    solo: false,
    locked: false,
    opacity: 100,
    contentFrames,
    propertyTracks: [],
  };
  
  // Find insert position (above currently selected layer)
  const activeLayerId = timelineStore.view.activeLayerId;
  const layers = timelineStore.layers;
  let insertIndex = layers.length; // Default: top
  
  if (activeLayerId) {
    const activeIndex = layers.findIndex((l) => l.id === activeLayerId);
    if (activeIndex !== -1) {
      insertIndex = activeIndex + 1; // Above active layer
    }
  }
  
  // Record for undo
  recordHistoryAction({
    type: 'GENERATOR_APPLY',
    generatorId: activeGeneratorId,
    newLayer,
    insertIndex,
  });
  
  // Insert layer
  const newLayers = [
    ...layers.slice(0, insertIndex),
    newLayer,
    ...layers.slice(insertIndex),
  ];
  
  timelineStore.setState({
    layers: newLayers,
    view: { ...timelineStore.view, activeLayerId: newLayer.id },
  });
  
  return true;
},
```

**UI Updates:**

```typescript
// Modify GeneratorPanel.tsx

// Remove import mode toggle (overwrite/append)
// Replace with informational text
<div className="text-sm text-muted-foreground">
  Generator output will create a new layer above the current selection.
</div>

// Update apply button
<Button onClick={applyGenerator}>
  Create Layer
</Button>
```

**History Action:**

```typescript
// Add to history types
interface GeneratorApplyAction {
  type: 'GENERATOR_APPLY';
  generatorId: string;
  newLayer: Layer;
  insertIndex: number;
}

// Undo: remove the created layer
// Redo: re-insert the layer at insertIndex
```

### 6.4 Effect Scope Toggle

**Purpose:** Allow users to switch effects between layer-scoped and global-scoped.

Add toggle to all effect UIs:

```typescript
export function EffectPanel({ effectId }) {
  const effect = useEffectsStore((s) => findEffect(s, effectId));
  const toggleScope = useEffectsStore((s) => s.toggleEffectScope);
  
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">Apply to:</span>
        <Switch
          checked={effect.scope === 'layer'}
          onCheckedChange={() => toggleScope(effectId)}
        />
        <span className="text-sm">
          {effect.scope === 'layer' ? 'Active Layer' : 'All Layers (Global)'}
        </span>
      </div>
      {/* Effect-specific controls */}
    </div>
  );
}
```

### 6.4a useFrameSynchronization Rewrite

> **⚠️ Critical Migration:** The existing `useFrameSynchronization.ts` (252 lines) is a fragile bidirectional
> sync hook with debouncing, loop guards, and JSON diffing. Rather than trying to modify it for the layer
> system, it should be **completely rewritten** from scratch.

**Delete:** `src/hooks/useFrameSynchronization.ts` (252 lines)  
**Create:** `src/hooks/useLayerCanvasSync.ts`

The new sync hook follows a **unidirectional** data flow:

```
timelineStore (source of truth)
    ↓
useLayerCanvasSync (derives active frame data)
    ↓
canvasStore (working canvas for drawing tools)
    ↓
on drawing mutation → write back to timelineStore active content frame
```

```typescript
/**
 * Replaces useFrameSynchronization.ts with a clean unidirectional sync.
 * 
 * OLD: Bidirectional sync with debounce, loop guards, JSON diff
 * NEW: Unidirectional: timelineStore → canvasStore → write-back on mutation
 */
export function useLayerCanvasSync() {
  const activeLayerId = useTimelineStore((s) => s.activeLayerId);
  const playheadFrame = useTimelineStore((s) => s.playbackState.currentFrame);
  const getContentFrame = useTimelineStore((s) => s.getContentFrameAt);
  
  // When active layer or playhead changes, load content into canvas
  useEffect(() => {
    if (!activeLayerId) return;
    
    const contentFrame = getContentFrame(activeLayerId, playheadFrame);
    if (contentFrame) {
      // Load content frame data into canvasStore for editing
      useCanvasStore.getState().loadFromData(contentFrame.data);
    } else {
      // No content at this frame — show blank canvas
      useCanvasStore.getState().clear();
    }
  }, [activeLayerId, playheadFrame, getContentFrame]);
  
  // Subscribe to canvas mutations and write back to timelineStore
  useEffect(() => {
    const unsubscribe = useCanvasStore.subscribe(
      (state) => state.cells,
      (cells) => {
        if (!activeLayerId) return;
        // Write canvas changes back to the active content frame
        useTimelineStore.getState().updateContentFrameData(activeLayerId, playheadFrame, cells);
      },
      { equalityFn: Object.is } // Only fire on reference change
    );
    return unsubscribe;
  }, [activeLayerId, playheadFrame]);
}
```

**Key improvements over the old sync:**
- No bidirectional sync loops (unidirectional only)
- No debouncing (immediate write-back via Zustand subscribe)
- No JSON diffing (reference equality check via `Object.is`)
- No loop guards needed (data flows one direction)
- Trivially testable (mock stores, assert writes)

### 6.4b timeEffectsStore Migration

> **⚠️ Missing from original plan:** The `timeEffectsStore.ts` manages wiggle, wave warp, and frame
> duration manipulation effects. These operate on per-frame data and must be updated to work with
> the layer-based content frame model.

**Modify:** `src/stores/timeEffectsStore.ts`

```typescript
// Current: timeEffectsStore operates on animationStore.frames[]
// New: timeEffectsStore must operate on per-layer content frames

// Key changes:
// 1. Wiggle effect: applies to active layer's content frames (or all layers if global scope)
// 2. Wave warp: applies to active layer's content frames
// 3. Frame duration manipulation: operates on timelineStore.config.fps and content frame timing

// Migration approach:
// - Replace all animationStore.frames[] references with timelineStore layer content
// - Add layer targeting (scope: 'layer' | 'global')
// - Reuse existing effect math, just change data source
```

### 6.4c generatorsStore Migration Detail

> **⚠️ Additional detail:** The `generatorsStore.ts` (808 lines) has 5 generator types deeply coupled
> to the frame model via `importFramesOverwrite` and `importFramesAppend`. Section 6.3 covers the
> general approach, but here are the specific migration steps per generator.

**Generator-specific migration:**

| Generator | Current Frame Access | New Layer Access | Notes |
|-----------|---------------------|-----------------|-------|
| RadioWaves | `importFramesOverwrite(frames)` | `addLayerWithContentFrames(name, frames)` | Each generate creates a new layer |
| TurbulentNoise | `importFramesOverwrite(frames)` | `addLayerWithContentFrames(name, frames)` | Memory-intensive — may need layer-level budgeting |
| ParticlePhysics | `importFramesAppend(frames)` | `addLayerWithContentFrames(name, frames)` | Change from append to new layer |
| RainDrops | `importFramesOverwrite(frames)` | `addLayerWithContentFrames(name, frames)` | Simplest migration |
| DigitalRain | `importFramesOverwrite(frames)` | `addLayerWithContentFrames(name, frames)` | Simplest migration |

### 6.4d MCP ProjectStateManager Migration

> **⚠️ Additional detail:** The MCP server's `ProjectStateManager` class (~900 lines) in
> `ascii-motion-mcp/src/state.ts` maintains an independent representation of the project state.
> It must be updated to understand the v2 layer-based data model.

**Modify:** `ascii-motion-mcp/src/state.ts`

```typescript
// Current: ProjectStateManager tracks frames[], canvas cells
// New: Must track layers[], content frames, property tracks, keyframes

// Key changes:
// 1. Internal state representation → add layers array
// 2. Zod schemas → add layer validation
// 3. WebSocket sync → handle layer-specific events
// 4. Tool handlers → route through layer targeting
```

### 6.5 MCP Protocol v2.0.0

**Modify:** `ascii-motion-mcp/src/types.ts`

Add layer types to MCP:

```typescript
// ascii-motion-mcp/src/types.ts

export interface MCPLayer {
  id: string;
  name: string;
  visible: boolean;
  solo: boolean;
  locked: boolean;
  opacity: number;
  contentFrameCount: number;
  propertyTrackCount: number;
}

export interface MCPKeyframe {
  frame: number;
  value: number;
  easing: string;
}

export interface MCPProjectV2 {
  version: '2.0.0';
  canvas: {
    width: number;
    height: number;
  };
  timeline: {
    frameRate: number;
    durationFrames: number;
  };
  layers: MCPLayer[];
}
```

**Modify:** `ascii-motion-mcp/src/tools/animation.ts`

Add layer management tools:

```typescript
// New MCP tools for layer management

export const layerTools = {
  'add_layer': {
    description: 'Add a new layer to the project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Layer name' },
      },
    },
    handler: async ({ name }) => {
      return await sendCommand('addLayer', { name });
    },
  },
  
  'remove_layer': {
    description: 'Remove a layer by ID',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string', description: 'Layer ID' },
      },
      required: ['layerId'],
    },
    handler: async ({ layerId }) => {
      return await sendCommand('removeLayer', { layerId });
    },
  },
  
  'set_active_layer': {
    description: 'Set the active layer for drawing operations',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string', description: 'Layer ID' },
      },
      required: ['layerId'],
    },
    handler: async ({ layerId }) => {
      return await sendCommand('setActiveLayer', { layerId });
    },
  },
  
  'add_keyframe': {
    description: 'Add a keyframe to a layer property',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        propertyPath: { type: 'string' },
        frame: { type: 'number' },
        value: { type: 'number' },
        easing: { type: 'string', default: 'linear' },
      },
      required: ['layerId', 'propertyPath', 'frame', 'value'],
    },
    handler: async (params) => {
      return await sendCommand('addKeyframe', params);
    },
  },
  
  'get_layers': {
    description: 'Get list of all layers in the project',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return await sendCommand('getLayers');
    },
  },
  
  'go_to_frame': {
    description: 'Move playhead to a specific frame',
    inputSchema: {
      type: 'object',
      properties: {
        frame: { type: 'number', description: 'Frame number' },
      },
      required: ['frame'],
    },
    handler: async ({ frame }) => {
      return await sendCommand('goToFrame', { frame });
    },
  },
};
```

### 6.6 MCP Resources Update

**Modify:** `ascii-motion-mcp/src/resources/guide.ts`

Update guide with layer system documentation:

```typescript
export const guideResource = {
  uri: 'guide://layer-timeline',
  name: 'Layer Timeline Guide',
  mimeType: 'text/markdown',
  content: `
# ASCII Motion Layer Timeline System

## Overview

ASCII Motion v2.0 introduces a layer-based timeline system similar to After Effects.

## Layers

Each project contains one or more layers. Layers are composited from bottom to top,
with upper layers obscuring lower layers where they overlap.

### Layer Properties
- **visible**: Show/hide layer in render and export
- **solo**: Only render this layer (for isolation)
- **locked**: Prevent editing
- **opacity**: Layer transparency (0-100%)

## Content Frames

Layers contain content frames - segments of ASCII canvas data with duration.
Content frames can be:
- Dragged to reposition in time
- Resized by dragging edges
- Duplicated and deleted

## Transform Keyframes

Each layer has keyframeable transform properties:
- Position X/Y (in cells)
- Scale (1.0 = 100%)
- Rotation (in 1° increments, with cell aspect ratio compensation)
- Opacity (0-100%)
- Anchor Point X/Y (rotation/scale center)

### Easing

Keyframes support cubic bezier easing:
- linear, ease-in, ease-out, ease-in-out
- Custom bezier curves
- Hold (no interpolation)

## API Examples

### Add a layer
\`\`\`json
{ "tool": "add_layer", "arguments": { "name": "Background" } }
\`\`\`

### Add position keyframe
\`\`\`json
{
  "tool": "add_keyframe",
  "arguments": {
    "layerId": "layer-1",
    "propertyPath": "transform.position.x",
    "frame": 0,
    "value": 0,
    "easing": "ease-out"
  }
}
\`\`\`
`,
};
```

### 6.7 Version Bump

**Modify:** `ascii-motion-mcp/package.json`

```json
{
  "name": "@asciimotion/mcp",
  "version": "2.0.0",
  ...
}
```

### 6.8 Testing Checkpoint

- [ ] Layer effects apply in correct order
- [ ] Global effects apply after layer compositing
- [ ] Effect scope toggle works (layer ↔ global)
- [ ] Effect property keyframes appear in timeline
- [ ] Effects applied to group affect all layers in group individually
- [ ] Generators always create new layers (no overwrite/append mode)
- [ ] Generator layers are named with increment ("Radio Waves 1", "Radio Waves 2")
- [ ] Generator layers insert above currently selected layer
- [ ] Generator apply is undoable
- [ ] All 5 generator types work with new layer system
- [ ] MCP `add_layer` tool works
- [ ] MCP `add_keyframe` tool works
- [ ] MCP `get_layers` returns correct data
- [ ] MCP guide resource is updated
- [ ] MCP version is 2.0.0

---

## Phase 7: Advanced Layer Features

**Duration:** 2-3 weeks  
**Goal:** Add advanced multi-layer features that were deferred from Phase 2 to reduce MVP scope

> **ℹ️ Coordinate Space Note (from Phase 4):** The `applyToAllLayers` drawing mode (§7.1) requires
> per-layer inverse transforms. The current `screenToLocal()` utility reads the active layer's transform.
> For multi-layer drawing, each target layer has its own transform, so the function must accept an
> explicit `layerId` parameter or be called per-layer with that layer's transform. The selection
> constraint system would also need per-layer awareness. Layer group transforms (§7.3) compose with
> child layer transforms — `inverseTransformPoint` would need to invert the composed transform.
> See `src/utils/layerTransformUtils.ts` for the existing utility patterns.

> **Prerequisite:** Phases 1-6 must be complete and stable before starting Phase 7.
> These features add complexity on top of the core layer system. They should only be built
> once the foundation is proven reliable.

### 7.1 Apply-to-All-Layers Drawing Mode

**Modify:** `src/stores/toolStore.ts`

Add layer targeting toggle for drawing tools:

```typescript
interface ToolState {
  // ... existing fields
  applyToAllLayers: boolean;  // false = current layer only (default)
}
```

**Drawing Tool Layer Interaction Rules:**

| Tool State | Target Layers | Behavior |
|------------|---------------|----------|
| `applyToAllLayers: false` | Active layer only | Default — draw only on active layer |
| `applyToAllLayers: true` | All visible, unlocked layers | Draw affects all eligible layers at once |

**Layer Eligibility Rules:**
- **Locked layers**: Never affected, even with "apply to all"
- **Invisible layers**: Never affected
- **Active layer indicator**: Always shows which layer receives solo drawing

```typescript
// Drawing tools with multi-layer support
function handleDraw(position: Point, toolState: ToolState) {
  if (toolState.applyToAllLayers) {
    const eligibleLayers = layers.filter(l => l.visible && !l.locked);
    for (const layer of eligibleLayers) {
      applyDrawToLayer(layer.id, position);
    }
  } else {
    const activeLayer = getActiveLayer();
    if (activeLayer && !activeLayer.locked) {
      applyDrawToLayer(activeLayer.id, position);
    }
  }
}
```

**Modify:** All drawing tool hooks:
- `src/hooks/useDrawingTool.ts`
- `src/hooks/useCanvasDragAndDrop.ts`
- `src/hooks/usePaintBucket.ts` (always single-layer — fill all layers would be confusing)
- `src/hooks/useEraserTool.ts`

### 7.2 Multi-Layer Selection Operations

**Modify:** `src/stores/toolStore.ts`

```typescript
interface ToolState {
  // ... existing fields
  selectionApplyToAllLayers: boolean;  // false = current layer only
}
```

**Selection Behavior:**

| Mode | Copy | Cut | Delete | Move | Transform |
|------|------|-----|--------|------|-----------|
| Current Layer | Active layer only | Active layer only | Active layer only | Active layer only | Active layer only |
| All Layers | All visible, unlocked | All visible, unlocked | All visible, unlocked | All visible, unlocked | All visible, unlocked |

```typescript
function handleSelectionAction(action: 'copy' | 'cut' | 'delete' | 'move' | 'transform', selection: Selection) {
  const { selectionApplyToAllLayers } = useToolStore.getState();
  
  if (selectionApplyToAllLayers) {
    const eligibleLayers = layers.filter(l => l.visible && !l.locked);
    for (const layer of eligibleLayers) {
      performSelectionAction(action, layer.id, selection);
    }
  } else {
    const activeLayer = getActiveLayer();
    if (activeLayer && !activeLayer.locked) {
      performSelectionAction(action, activeLayer.id, selection);
    }
  }
}

// Paste always creates content on active layer
function handlePaste(clipboardData: ClipboardData) {
  const activeLayer = getActiveLayer();
  if (activeLayer && !activeLayer.locked) {
    pasteToLayer(activeLayer.id, clipboardData);
  }
}
```

### 7.3 Layer Groups

**Purpose:** Allow grouping layers for organizational and transform purposes. Groups have their own transform properties that apply to all child layers.

> **Note:** Layer Groups add significant complexity (group transforms compose with layer transforms,
> group visibility/lock cascade to children, group serialization/deserialization). This feature is
> intentionally deferred until the core layer system is proven stable.

**Types (already defined in Phase 1 types):** `LayerGroup`, `LayerGroupId`

**Store Actions to add to `timelineStore.ts`:**

```typescript
createGroup: (name?: string, layerIds?: LayerId[]) => LayerGroupId;
ungroupLayers: (groupId: LayerGroupId) => void;
addLayerToGroup: (layerId: LayerId, groupId: LayerGroupId) => void;
removeLayerFromGroup: (layerId: LayerId) => void;
setGroupCollapsed: (groupId: LayerGroupId, collapsed: boolean) => void;
setGroupVisible: (groupId: LayerGroupId, visible: boolean) => void;
setGroupSolo: (groupId: LayerGroupId, solo: boolean) => void;
setGroupLocked: (groupId: LayerGroupId, locked: boolean) => void;
```

**Transform Composition:**

```typescript
function getEffectiveTransform(layer: Layer, frame: number): TransformValues {
  const layerTransform = getLayerTransform(layer, frame);
  if (layer.parentGroupId) {
    const group = getGroup(layer.parentGroupId);
    const groupTransform = getGroupTransform(group, frame);
    return composeTransforms(groupTransform, layerTransform);
  }
  return layerTransform;
}
```

**New Components:**
- `src/components/features/GroupListItem.tsx` — Collapsible group header in timeline
- `src/utils/transformComposition.ts` — Group + layer transform composition

### 7.4 Merge Layers

**Purpose:** Combine multiple layers into one, flattening their content.

**Commands (accessible from Animation panel hamburger menu):**

1. **Merge Down**: Merge selected layer with the layer directly below it
2. **Merge Visible**: Merge all visible layers into one layer

```typescript
mergeDown: (layerId: LayerId) => {
  const layers = get().layers;
  const layerIndex = layers.findIndex((l) => l.id === layerId);
  if (layerIndex <= 0) return;
  
  const topLayer = layers[layerIndex];
  const bottomLayer = layers[layerIndex - 1];
  const mergedContentFrames = mergeLayerContent(topLayer, bottomLayer, get().config);
  
  const mergedLayer: Layer = {
    id: generateLayerId(),
    name: `${bottomLayer.name} + ${topLayer.name}`,
    visible: true, solo: false, locked: false, opacity: 100,
    contentFrames: mergedContentFrames,
    propertyTracks: [],  // Transforms are baked in
  };
  
  recordHistoryAction({ type: 'LAYER_MERGE', removedLayers: [topLayer, bottomLayer], newLayer: mergedLayer, insertIndex: layerIndex - 1 });
  
  const newLayers = [...layers.slice(0, layerIndex - 1), mergedLayer, ...layers.slice(layerIndex + 1)];
  set({ layers: newLayers });
},
```

### 7.5 Testing Checkpoint

- [ ] "Apply to all layers" drawing mode affects all visible, unlocked layers
- [ ] Eraser with "apply to all layers" works on all visible, unlocked layers
- [ ] Selection tool has layer mode toggle in options panel
- [ ] Selection "all layers" mode affects all visible, unlocked layers
- [ ] Can create layer groups
- [ ] Can add/remove layers from groups
- [ ] Groups can be collapsed in timeline
- [ ] Group transforms apply to all child layers (group first, then layer)
- [ ] Group visibility affects child layer visibility
- [ ] Group lock affects child layer editability
- [ ] Merge Down combines two layers correctly
- [ ] Merge Visible combines all visible layers
- [ ] All group/merge operations are undoable
- [ ] Groups serialize/deserialize correctly in session files
- [ ] MCP tools handle groups correctly

---

## File Change Matrix

### Main Repository (Ascii-Motion)

| File | Phase | Change Type | Description |
|------|-------|-------------|-------------|
| `src/types/timeline.ts` | 1 | NEW | All timeline type definitions |
| `src/types/easing.ts` | 1 | NEW | Easing curve utilities |
| `src/stores/timelineStore.ts` | 1 | NEW | Timeline state management |
| `src/stores/toolStore.ts` (undo/redo) | 1 | MODIFY | Add layer history action types (undo/redo logic lives here, not in a separate historyStore) |
| `src/hooks/useTimelineHistory.ts` | 1 | NEW | Replaces `useAnimationHistory.ts` — wraps all layer/timeline mutations with undo/redo recording |
| `src/stores/animationStoreAdapter.ts` | 1 | NEW | Compatibility adapter providing backward-compatible `useAnimationStore` API over `timelineStore` |
| `src/utils/sessionMigration.ts` | 1 | NEW | v1→v2 migration |
| `src/stores/canvasStore.ts` | 2 | MODIFY | Active layer sync |
| `src/utils/layerCompositing.ts` | 2 | NEW | Layer rendering |
| `src/hooks/useCanvasRenderer.ts` | 2 | MODIFY | Use layer compositing |
| `src/hooks/useLayerLimit.ts` | 2 | NEW | Subscription tier check |
| `src/components/features/Header.tsx` | 2 | MODIFY | Layer indicator |
| `src/stores/toolStore.ts` | 2 | MODIFY | Layer targeting toggle |
| `src/pages/EditorPage.tsx` | 3 | MODIFY | Resizable panel (replaces CollapsiblePanel toggle with drag handle) |
| `src/components/features/TimelineTabs.tsx` | 3 | NEW | View tabs |
| `src/components/features/LayerList.tsx` | 3 | NEW | Layer panel |
| `src/components/features/LayerListItem.tsx` | 3 | NEW | Layer row |
| `src/components/features/PropertyTrackRow.tsx` | 3 | NEW | Property track |
| `src/components/features/AddPropertyButton.tsx` | 3 | NEW | Add property menu |
| `src/components/features/TimelineRuler.tsx` | 3 | NEW | Ruler & playhead |
| `src/components/features/ContentFrameBlock.tsx` | 3 | NEW | Draggable frames |
| `src/components/features/KeyframeDiamond.tsx` | 3 | NEW | Keyframe UI |
| `src/components/features/KeyframeEditorPanel.tsx` | 3 | NEW | Keyframe editor |
| `src/components/features/EasingCurveEditor.tsx` | 3 | NEW | Bezier editor |
| `src/components/features/TimecodeDisplay.tsx` | 3 | NEW | Timecode formats |
| `src/utils/keyframeInterpolation.ts` | 4 | NEW | Value interpolation |
| `src/hooks/usePropertyValues.ts` | 4 | NEW | Property value hook |
| `src/hooks/useKeyframeableProperty.ts` | 4 | NEW | Side panel hook |
| `src/components/features/AnchorPointOverlay.tsx` | 4 | NEW | Anchor + motion path overlay |
| `src/components/features/CanvasOverlay.tsx` | 4 | MODIFY | Add anchor overlay |
| `src/stores/layerPlaybackStore.ts` | 4 | NEW | Non-React playback store for layers |
| `src/hooks/useOptimizedLayerPlayback.ts` | 4 | NEW | Layer-aware playback loop |
| `src/components/features/FrameDurationDialog.tsx` | 3 | NEW | Precise duration editing dialog |
| `src/components/features/FrameViewPanel.tsx` | 3 | NEW | Flattened frame view |
| `src/components/features/GroupListItem.tsx` | 7 | NEW | Group UI in timeline (Phase 7: Advanced) |
| `src/utils/transformComposition.ts` | 7 | NEW | Group + layer transform composition (Phase 7: Advanced) |
| `src/utils/exportDataCollector.ts` | 5 | MODIFY | Layer data collection |
| `src/utils/videoExporter.ts` | 5 | MODIFY | Layer compositing |
| `src/utils/exportRenderer.ts` | 5 | MODIFY | Layer compositing |
| `src/utils/sessionExporter.ts` | 5 | MODIFY | v2 format |
| `src/utils/sessionImporter.ts` | 5 | MODIFY | v1/v2 loading |
| `src/stores/effectsStore.ts` | 6 | MODIFY | Layer effects |
| `src/stores/timeEffectsStore.ts` | 6 | MODIFY | Wiggle/wave warp → layer content frames |
| `src/stores/generatorsStore.ts` | 6 | MODIFY | Generators create layers instead of overwriting frames |
| `src/hooks/useLayerCanvasSync.ts` | 6 | NEW | Replaces useFrameSynchronization.ts (unidirectional sync) |
| `src/hooks/useFrameSynchronization.ts` | 6 | DELETE | Replaced by useLayerCanvasSync.ts |
| `src/hooks/useAnimationHistory.ts` | 1 | MIGRATE | Becomes useTimelineHistory.ts |
| `src/stores/animationStore.ts` | 6 | DELETE | Replaced by timelineStore + adapter (adapter removed after Phase 5) |

### Premium Submodule

| File | Phase | Change Type | Description |
|------|-------|-------------|-------------|
| Premium tier config (hooks/context) | 2 | MODIFY | Max layers per tier (no subscriptionStore exists; uses Stripe hooks) |
| `src/services/projectService.ts` | 5 | MODIFY | v2 format handling |
| `src/utils/previewGenerator.ts` | 5 | MODIFY | Composited preview |

### MCP Package (ascii-motion-mcp)

| File | Phase | Change Type | Description |
|------|-------|-------------|-------------|
| `src/types.ts` | 6 | MODIFY | Add layer types |
| `src/tools/animation.ts` | 6 | MODIFY | Layer tools |
| `src/tools/index.ts` | 6 | MODIFY | Export layer tools |
| `src/resources/guide.ts` | 6 | MODIFY | Layer documentation |
| `package.json` | 6 | MODIFY | Version bump to 2.0.0 |

---

## Testing Strategy

### Vitest Infrastructure

**Configuration:** `vitest.config.ts` at project root.

| Setting | Value | Rationale |
|---------|-------|-----------|
| Environment | `jsdom` | React hooks require DOM APIs |
| Globals | `true` | `describe`/`it`/`expect` available without import |
| Test pattern | `src/**/*.test.{ts,tsx}` | Co-located or `__tests__/` both supported |
| Coverage provider | `v8` | Fast native coverage |
| Coverage targets | `src/types/timeline.ts`, `src/types/easing.ts`, `src/utils/sessionMigration.ts`, `src/stores/timelineStore.ts`, `src/hooks/useTimelineHistory.ts` | Expand per phase |
| Path aliases | `@` → `./src`, `@ascii-motion/core`, `@ascii-motion/premium` | Mirrors `vite.config.ts` |

**Scripts (`package.json`):**
- `npm test` — watch mode (development)
- `npm run test:run` — single run (CI / pre-commit)
- `npm run test:coverage` — single run with v8 coverage report

**Dependencies (devDependencies):**
- `vitest` — test runner
- `jsdom` — DOM environment
- `@testing-library/react` — `renderHook`, `act` for hook tests
- `@testing-library/jest-dom` — extended matchers (`toBeInTheDocument`, etc.)

### Test Patterns by Module Type

**1. Zustand Store Tests** (e.g., `timelineStore.test.ts`)
- Import the store directly: `import { useTimelineStore } from '../stores/timelineStore'`
- Call `createNewProject()` in `beforeEach` to reset state
- Read state with `useTimelineStore.getState()`
- Call actions directly: `useTimelineStore.getState().addLayer('Test')`
- Assert state changes: `expect(useTimelineStore.getState().layers).toHaveLength(2)`
- No React rendering needed — Zustand stores work outside React

**2. Hook Tests** (e.g., `useTimelineHistory.test.ts`)
- Use `renderHook` from `@testing-library/react`
- Mock dependencies with `vi.mock()`:
  ```ts
  vi.mock('../stores/toolStore', () => ({
    useToolStore: { getState: () => ({ pushToHistory: mockPushToHistory }) }
  }));
  ```
- Call hook methods inside `act()`:
  ```ts
  const { result } = renderHook(() => useTimelineHistory());
  act(() => result.current.addLayer('Test'));
  ```
- Assert both side effects (store state) and history recording (mock calls)

**3. Pure Function Tests** (e.g., `easing.test.ts`, `sessionMigration.test.ts`)
- Import functions directly, no mocking needed
- Test boundary conditions: 0, 1, negative values, empty inputs
- Test mathematical properties: monotonicity, continuity, expected values
- Test error recovery: malformed input, missing fields, null values

### Test Naming Conventions

- Files: `<module>.test.ts` or `<module>.test.tsx` (for component tests)
- Location: `src/__tests__/` for unit tests, or co-located next to source files
- Describe blocks: match module/feature name
- Test names: action-oriented, describe expected behavior:
  - ✅ `'addLayer inserts above active layer'`
  - ✅ `'removeLayer enforces minimum 1 layer'`
  - ❌ `'test addLayer'` (too vague)

### Per-Phase Testing Checklist Template

Each phase testing checkpoint (§X.Y) should include:

1. **Store tests** — All new store actions have test coverage
2. **Pure function tests** — All utility functions tested with boundary cases
3. **Hook tests** — All wrapped operations verify history recording
4. **Integration tests** — Cross-module interactions verified (when applicable)
5. **Run full suite** — `npm run test:run` with 0 failures
6. **Coverage check** — `npm run test:coverage` for new files (target: >80% line coverage)

### Unit Tests

**Keyframe & Interpolation:**
- Keyframe interpolation with all easing types (linear, hold, ease-in, ease-out, ease-in-out, ease-out-back, ease-in-back, bounce)
- Custom bezier curve interpolation
- Loop keyframes wrapping behavior
- Property value calculation at any frame
- Keyframe interpolation edge cases (single keyframe, no keyframes, keyframe at frame 0)

**Layer Compositing:**
- Layer compositing with visibility/solo/lock combinations
- Content frame gap handling (should show blank)
- Layer order affects cell priority (top wins)
- Empty cell does not overwrite non-empty cell
- Transform application (position, scale, rotation with aspect ratio)
- Rotation at 1° increments with cell aspect ratio compensation
- Cells rotated off-canvas are preserved, not deleted

**Session Format:**
- Session migration v1→v2 produces valid v2 structure
- v1 frames convert to content frames with correct timing
- v1 frameRate preserved in migration
- v2 round-trip (serialize → deserialize) preserves all data
- Layer groups serialize and deserialize correctly

**State Synchronization:**
- Canvas → Timeline sync on debounce
- Timeline → Canvas sync on layer switch
- Timeline → Canvas sync on frame navigation
- Drawing at content frame gap creates new content frame

### Integration Tests

**Save/Load Cycle:**
- Full save/load cycle with layers preserves all data
- Full save/load cycle with layer groups preserves structure
- Load v1.0.0 project, make changes, save as v2.0.0
- Cloud storage with compression handles layer data

**Export Formats:**
- Export PNG with multi-layer project
- Export GIF with multi-layer project
- Export video (MP4/WebM) with multi-layer project
- Export HTML with layer animation
- Export JSON with full layer data
- All 10+ export formats work with layer data

**MCP Integration:**
- MCP add_layer round-trip
- MCP add_keyframe round-trip
- MCP get_layers returns accurate data
- MCP protocol version is 2.0.0

**Cross-Cutting Concerns:**
- Undo/redo for all layer operations
- Undo/redo batching (keyframe drag = single undo)
- History limit doesn't corrupt layer state
- Frame rate conversion maintains duration in seconds

### Edge Case Tests

**Content Frame Edge Cases:**
- Content frame at frame 0 with 0 duration (should be 1 minimum)
- Overlapping content frames (should not happen, validate on input)
- Content frame extends past timeline (auto-expand timeline)
- Double-click content frame opens duration dialog
- Duration dialog allows fractional seconds

**Keyframe Edge Cases:**
- Keyframe at frame 0
- Multiple keyframes at same frame (should not happen, last wins)
- Keyframe moved past timeline end (auto-expand timeline)
- Delete all keyframes from track (track remains, shows default value)

**Layer Edge Cases:**
- Delete active layer (select next layer or none)
- Delete all layers (should maintain at least one? or allow empty?)
- Layer limit at exactly 5 (can add 5th, cannot add 6th)
- Solo multiple layers simultaneously
- Lock layer prevents all edits (draw, keyframe add, rename)

**Frame Rate Conversion Edge Cases:**
- Convert 24fps → 12fps (halves frame counts, rounds)
- Convert 12fps → 30fps (2.5x, rounds to nearest)
- Keyframes at odd frames after conversion
- Content frame duration minimum of 1 after conversion

**Playback Edge Cases:**
- Playback with no layers
- Playback with all layers hidden
- Playback with only locked layers
- Playback performance with maximum layers (5 on free, unlimited on Pro)

### Performance Benchmark Tests

**Layer Compositing Performance:**
- 5 layers, 100 frames: < 100ms total composite time at playback start
- 5 layers, 1000 frames: < 1s total composite time
- Single frame composite: < 5ms for 5 layers on 80x24 canvas
- Single frame composite: < 20ms for 5 layers on 200x100 canvas

**Playback Performance:**
- Maintain 60fps with 5 layers (pre-composited)
- Maintain 30fps with 10 layers (Pro tier stress test)
- Playback start delay: < 200ms for 5 layers, 100 frames

**Timeline UI Performance:**
- Scroll/zoom timeline with 100 keyframes: < 16ms per frame
- Drag content frame: no visible lag
- Drag keyframe: no visible lag

### Manual Testing Checklist

#### Phase 1
- [ ] Create new project, verify 1 default layer at 12 FPS
- [ ] Verify timeline starts with 1 frame duration
- [ ] Add/remove layers via console
- [ ] Verify undo/redo for layer operations
- [ ] Verify timeline auto-expands when content added

#### Phase 2
- [ ] Add 5 layers (free tier limit)
- [ ] Attempt 6th layer, see upgrade prompt
- [ ] Toggle visibility, solo, lock
- [ ] Rename layers
- [ ] Reorder layers
- [ ] Draw on different layers
- [ ] Verify compositing renders correctly

#### Phase 3
- [ ] Resize bottom panel via drag
- [ ] Switch between Frames and Timeline views
- [ ] Expand/collapse layers
- [ ] Add properties via menu
- [ ] Drag content frame edges to resize
- [ ] Double-click content frame, verify duration dialog
- [ ] Drag keyframe diamonds
- [ ] Edit keyframe in side panel
- [ ] Use easing presets
- [ ] Create custom easing curve
- [ ] Verify Frame View shows flattened frames

#### Phase 4
- [ ] Keyframe position animation plays correctly
- [ ] Keyframe scale snaps to whole cells
- [ ] Keyframe rotation works at 1° increments
- [ ] Anchor point overlay shows when editing
- [ ] Motion path dots show position at each frame
- [ ] Live preview updates on value change
- [ ] Loop keyframes repeat correctly
- [ ] Playback maintains 60fps with layers
- [ ] Onion skinning "current layer" mode works
- [ ] Onion skinning "all layers" mode works

#### Phase 5
- [ ] Save project, verify v2.0.0 format
- [ ] Load old v1.0.0 project, verify migration
- [ ] Load v2.0.0 project with groups
- [ ] Export PNG with layers
- [ ] Export video with layers
- [ ] Cloud save with layers
- [ ] Community preview shows composited frame
- [ ] Change frame rate, verify duration maintained

#### Phase 6
- [ ] Add effect to layer
- [ ] Toggle effect scope
- [ ] Verify effect render order
- [ ] MCP add_layer works
- [ ] MCP add_keyframe works
- [ ] MCP get_layers returns data

#### Phase 7
- [ ] Test "apply to all layers" drawing mode
- [ ] Test selection tool layer modes
- [ ] Create layer group
- [ ] Add/remove layers from groups
- [ ] Verify group transforms apply to children
- [ ] Test Merge Down command
- [ ] Test Merge Visible command

---

## Performance Considerations

### Layer Compositing

**Challenge**: Compositing multiple layers on every frame could impact 60fps rendering.

**Mitigations**:

1. **Per-Layer Render Cache**: Cache each layer's transformed cells until layer content or keyframes change
2. **Dirty Tracking**: Only re-composite when layers actually change
3. **Top-Down Early Exit**: Since only the topmost non-empty cell matters, iterate layers from top to bottom and skip covered cells
4. **Frame Caching**: Cache composited frames during playback (memory permitting)

```typescript
// Example: Cached layer compositing
const layerCaches = new Map<LayerId, {
  frame: number;
  transforms: TransformValues;
  cells: Map<string, Cell>;
}>();

function getLayerCells(layer: Layer, frame: number): Map<string, Cell> {
  const cache = layerCaches.get(layer.id);
  const currentTransforms = getTransformValues(layer, frame);
  
  if (cache && cache.frame === frame && deepEqual(cache.transforms, currentTransforms)) {
    return cache.cells;
  }
  
  const cells = computeLayerCells(layer, frame);
  layerCaches.set(layer.id, { frame, transforms: currentTransforms, cells });
  return cells;
}
```

### Timeline UI

**Challenge**: Many keyframe diamonds and property tracks could cause render lag.

**Mitigations**:

1. **Virtualization**: Only render visible timeline region
2. **Canvas Rendering**: Use canvas instead of DOM for keyframe diamonds
3. **Debounced Updates**: Batch timeline scroll/zoom updates

### Session File Size

**Challenge**: Layer data increases file size.

**Mitigations**:

1. **Compression**: Already implemented (gzip for files >100KB)
2. **Layer Limits**: 5 layers for free tier
3. **Shared Content Frames**: If same content appears in multiple places, reference instead of duplicate

### Error Recovery

**Challenge**: Layer compositing, playback, or data corruption could cause runtime errors.

**Mitigations**:

1. **Compositing Error Boundary**: Wrap `compositeLayersAtFrame` in try/catch. On failure, log the error and render only the layers that succeeded, skipping the problematic layer.

2. **Playback Error Recovery**: If a frame fails to render during playback, skip it and continue. Show a warning toast but don't stop playback entirely.

3. **Session Import Validation**: Validate incoming session data against expected types before loading. If layers have corrupted content frames (missing data, invalid coordinates), attempt repair:
   - Missing `data` field: Initialize to empty Map
   - Negative `startFrame`: Clamp to 0
   - `durationFrames` < 1: Set to 1
   - Overlapping content frames: Keep first, shift subsequent

4. **Corrupted Layer Isolation**: If a layer fails to render consistently, automatically hide it and show a notification suggesting the user delete and re-create it.

### Dynamic Memory Budgeting

> **⚠️ Added based on codebase review:** The existing `playbackOnlyStore.ts` (153 lines) pre-caches
> all frame snapshots in memory during playback. With layers, memory usage grows as
> `layers × frames × canvasSize`. A static budget will either waste memory on small projects
> or OOM on large ones.

**Approach:** Query available memory at startup and set dynamic cache limits.

```typescript
// Dynamic memory budget based on canvas size and layer count
function calculateMemoryBudget(): MemoryBudget {
  const canvasWidth = useCanvasStore.getState().width;
  const canvasHeight = useCanvasStore.getState().height;
  const layerCount = useTimelineStore.getState().layers.length;
  
  // Estimate bytes per frame: each cell ≈ 50 bytes (char + fg + bg + metadata)
  const bytesPerFrame = canvasWidth * canvasHeight * 50;
  const bytesPerComposited = bytesPerFrame; // Composited frame is same size
  
  // Target: stay under 200MB for frame caches
  const TARGET_CACHE_MB = 200;
  const targetBytes = TARGET_CACHE_MB * 1024 * 1024;
  
  // Layer caches: one cached frame per layer
  const layerCacheBytes = layerCount * bytesPerFrame;
  
  // Remaining budget for composited frame cache
  const remainingBytes = targetBytes - layerCacheBytes;
  const maxCachedFrames = Math.max(10, Math.floor(remainingBytes / bytesPerComposited));
  
  return {
    maxCachedFrames,
    layerCacheEnabled: true,
    useLRUEviction: maxCachedFrames < useTimelineStore.getState().config.totalFrames,
  };
}

// LRU cache for composited frames during playback
class FrameLRUCache {
  private cache = new Map<number, Map<string, Cell>>();
  private accessOrder: number[] = [];
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  get(frame: number): Map<string, Cell> | undefined {
    const result = this.cache.get(frame);
    if (result) {
      // Move to end of access order
      this.accessOrder = this.accessOrder.filter(f => f !== frame);
      this.accessOrder.push(frame);
    }
    return result;
  }
  
  set(frame: number, data: Map<string, Cell>) {
    if (this.cache.size >= this.maxSize) {
      // Evict least recently used
      const evictFrame = this.accessOrder.shift()!;
      this.cache.delete(evictFrame);
    }
    this.cache.set(frame, data);
    this.accessOrder.push(frame);
  }
}
```

**Budget recalculation triggers:**
- Layer added or removed
- Canvas resized
- Project loaded

```typescript
// Safe compositing wrapper
function safeCompositeLayersAtFrame(
  layers: Layer[], frame: number, width: number, height: number
): Map<string, Cell> {
  const result = new Map<string, Cell>();
  for (const layer of layers) {
    try {
      const layerCells = compositeLayerAtFrame(layer, frame, width, height);
      for (const [key, cell] of layerCells) {
        result.set(key, cell);
      }
    } catch (error) {
      console.error(`Layer "${layer.name}" failed to composite at frame ${frame}:`, error);
      // Continue with remaining layers
    }
  }
  return result;
}
```

### Progressive Loading

**Challenge**: Large projects (1000+ frames, many layers) could block the UI during import.

**Mitigations**:

1. **Async Import**: Use `requestIdleCallback` or chunk processing to avoid blocking the main thread during session import.

2. **Progress Indicator**: Show a progress bar during large session loads:
   - Phase 1: Parsing JSON (fast)
   - Phase 2: Deserializing layers and content frames (may be slow with many frames)
   - Phase 3: Rendering first frame

3. **Lazy Thumbnail Generation**: Don't generate content frame thumbnails on import. Generate them on-demand when they scroll into view in the timeline.

```typescript
async function importSessionAsync(data: SessionDataV2, onProgress: (pct: number) => void) {
  onProgress(0.1); // JSON parsed
  
  // Deserialize layers in chunks
  const layers: Layer[] = [];
  for (let i = 0; i < data.layers.length; i++) {
    layers.push(deserializeLayer(data.layers[i]));
    onProgress(0.1 + (i / data.layers.length) * 0.7);
    await yieldToMain(); // Yield to keep UI responsive
  }
  
  onProgress(0.8);
  // Load into stores...
  onProgress(1.0);
}

function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
```

---

## Backward Compatibility

### Loading Old Projects

1. **Version Detection**: Check `version` field in session data
2. **Automatic Migration**: Convert v1.0.0 to v2.0.0 on load
3. **Single Layer Conversion**: Old frames become content frames in one layer
4. **Duration Conversion**: Frame duration (ms) → content frame duration (frames)

### API Compatibility

**animationStore Deprecation:**

The existing `animationStore` will be **deprecated and eventually removed**. During the transition period:
1. `timelineStore` becomes the new canonical source of truth
2. `animationStore` is kept as a compatibility shim that reads from `timelineStore`
3. All new code must use `timelineStore` directly
4. A deprecation warning will be logged when accessing `animationStore` methods
5. Full removal targeted for v2.1.0 after migration period

| Old API | New API | Migration |
|---------|---------|-----------|
| `animationStore.frames` | `timelineStore.layers[].contentFrames` | Access via compositing |
| `animationStore.currentFrameIndex` | `timelineStore.view.currentFrame` | Direct mapping |
| `animationStore.frameRate` | `timelineStore.config.frameRate` | Direct mapping |
| `canvasStore.cells` | Active layer's content frame | Sync via `syncFromContentFrame` |

### Export Compatibility

All export formats continue to work by using `computeFramesFromLayers()` to generate flattened frames for export.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation with many layers | Medium | High | Aggressive caching, layer limits, LRU eviction, dynamic memory budgeting |
| Breaking existing projects | Low | Critical | Thorough migration testing, v1 format preserved, automatic v1→v2 migration on load |
| UI complexity overwhelming users | Medium | Medium | Frame view as simpler alternative, progressive disclosure |
| MCP protocol breaking changes | Low | Medium | Version bump, clear migration docs, MCP ProjectStateManager v2 |
| Cloud storage size increase | Medium | Low | Compression, tier limits |
| Undo/redo state explosion | Medium | Medium | Batch related actions, limit history depth, drag session batching |
| Memory exhaustion from frame pre-computation | Medium | High | Dynamic memory budgeting, LRU fallback, configurable thresholds |
| Data loss from debounced canvas sync | Low | High | `beforeunload` guard, periodic sync, unidirectional sync design |
| Transform composition math errors | Medium | Medium | Comprehensive unit tests, reference comparison to known-good values |
| Content frame overlap corruption | Low | High | Validation on all mutation paths |
| **animationStore adapter complexity** | **Medium** | **High** | **Incremental migration (P0→P3), adapter removed after Phase 5, clear migration tracking** |
| **47-file coupling to animationStore** | **High** | **High** | **Compatibility adapter provides drop-in replacement; migrate files in priority order** |
| **55-file coupling to canvasStore** | **Medium** | **Medium** | **canvasStore API unchanged; internal data source changes to layer content** |
| **useAnimationHistory migration** | **Medium** | **High** | **New useTimelineHistory replicates all 25 action types; old hook kept as thin wrapper during transition** |
| **useFrameSynchronization rewrite** | **Medium** | **High** | **Full rewrite to unidirectional flow eliminates fragility; comprehensive tests before/after** |
| **timeEffectsStore not updated** | **Low** | **Medium** | **Explicit migration plan added in Phase 6.4b; effect math reused, only data source changes** |
| **Scope creep in Phase 2** | **Medium** | **Medium** | **Advanced features (groups, multi-layer draw, merge) deferred to Phase 7** |
| **Feature branch divergence from main** | **Medium** | **Medium** | **Weekly sync of main into feature branch; hotfix protocol enforced** |
| **Production deployment risk** | **Low** | **Critical** | **Feature branch never merges to main until all phases complete; preview deploys only** |

**Overall Success Probability:**
- As originally written: ~55-60%
- With adjustments in this v2.0.0 plan: ~80-85%
- Primary risk factors: coupling complexity (47+55 file dependencies), undo/redo migration, frame sync rewrite

---

## Resolved Design Decisions

1. **Layer Blend Modes**: 
   - **Decision**: No blend modes. Always "top wins" layering based on z-order in the timeline layer list.
   - **Rationale**: ASCII characters cannot blend - only one character can occupy a cell.

2. **Minimum Layer Count**:
   - **Decision**: A project must always have at least one layer.
   - **Behavior**: When deleting the last remaining layer, automatically create a new empty layer.
   - **Rationale**: Canvas always needs an active layer to receive drawing input. This matches behavior in Photoshop, After Effects, etc.

3. **Layer Groups**: 
   - **Decision**: Support one level of layer grouping.
   - Groups have their own transform properties (applied before child layer transforms)
   - Effects applied to a group are applied to each layer individually (no flattening)
   - Groups can be collapsed in the timeline UI
   - Groups cannot contain other groups (single nesting level)

4. **Audio Track**: 
   - **Decision**: No audio support in this refactor.
   - May be considered for a future version.

5. **Keyboard Shortcuts**: 
   - **Decision**: Keyboard shortcuts for layer operations will be defined here and implemented during Phase 3 (Timeline UI).
   - Will follow existing shortcut patterns in the application.
   
   **Planned Shortcuts:**
   
   | Action | Shortcut | Notes |
   |--------|----------|-------|
   | New Layer | `Ctrl/Cmd + Shift + N` | Creates empty layer above active |
   | Delete Layer | `Backspace/Delete` (with layer focused) | Confirms if layer has content |
   | Duplicate Layer | `Ctrl/Cmd + J` | Photoshop convention |
   | Merge Down | `Ctrl/Cmd + E` | Photoshop convention |
   | Select Layer Above | `Alt + ]` | Standard layer navigation |
   | Select Layer Below | `Alt + [` | Standard layer navigation |
   | Toggle Layer Visibility | `Ctrl/Cmd + Shift + H` | When layer panel focused |
   | Lock/Unlock Layer | `Ctrl/Cmd + /` | Toggle |
   | Group Selected Layers | `Ctrl/Cmd + G` | Standard grouping |
   | Ungroup | `Ctrl/Cmd + Shift + G` | Standard ungrouping |
   | Add Keyframe | `K` | At current frame on active property |
   | Play/Pause | `Space` | Already exists, unchanged |
   | Next Frame | `Right Arrow` | Already exists, unchanged |
   | Previous Frame | `Left Arrow` | Already exists, unchanged |

6. **Accessibility**:
   - **Decision**: Timeline and layer UI must support keyboard navigation.
   - Layer list items are focusable and operable via keyboard.
   - Timeline keyframes are focusable with arrow key navigation.
   - Screen reader announcements for layer add/remove/reorder.
   - All toggle states (visible, solo, locked) have `aria-pressed` attributes.
   - Focus management: When deleting a layer, focus moves to adjacent layer.

---

## Appendix: Migration Examples

### Example v1.0.0 Session

```json
{
  "version": "1.0.0",
  "animation": {
    "frames": [
      { "id": "f1", "name": "Frame 1", "duration": 100, "data": { "0,0": { "char": "H", "color": "#fff", "bgColor": "#000" } } },
      { "id": "f2", "name": "Frame 2", "duration": 100, "data": { "1,0": { "char": "i", "color": "#fff", "bgColor": "#000" } } }
    ],
    "frameRate": 24,
    "looping": true
  }
}
```

### Migrated to v2.0.0

```json
{
  "version": "2.0.0",
  "timeline": {
    "frameRate": 24,
    "durationFrames": 5,
    "looping": true
  },
  "layers": [
    {
      "id": "layer-1",
      "name": "Layer 1",
      "visible": true,
      "solo": false,
      "locked": false,
      "opacity": 100,
      "contentFrames": [
        { "id": "f1", "name": "Frame 1", "startFrame": 0, "durationFrames": 2, "data": { "0,0": { "char": "H", "color": "#fff", "bgColor": "#000" } } },
        { "id": "f2", "name": "Frame 2", "startFrame": 2, "durationFrames": 3, "data": { "1,0": { "char": "i", "color": "#fff", "bgColor": "#000" } } }
      ],
      "propertyTracks": []
    }
  ]
}
```

---

## Implementation Progress

> **Last updated:** 2026-02-05
> **Current branch:** `phase-2/layer-data-model` (off `timeline-refactor` off `main`)
> **Commit status:** Phase 1 and Phase 2 committed and published.

### Phase 1: Timeline Foundation

| Task | File(s) | Status | Notes |
|------|---------|--------|-------|
| §1.2 Type definitions | `src/types/timeline.ts` | ✅ DONE | All branded IDs, Layer, ContentFrame, PropertyTrack, Keyframe, EasingCurve, TimelineConfig, TimelineViewState, SessionDataV2, helper fns, PROPERTY_DEFINITIONS registry, EASING_PRESETS |
| §1.2 Easing utilities | `src/types/easing.ts` | ✅ DONE | Newton-Raphson cubic bezier solver with LUT caching (Float64Array, 256 entries), keyframe interpolation system, preset evaluation |
| §1.3 Session migration | `src/utils/sessionMigration.ts` | ✅ DONE | Version detection (v1/v2/unknown), v1→v2 migration with frame rate preservation, validation & repair (negative startFrame, duration<1, overlapping frames) |
| §1.3-§1.5 Timeline store | `src/stores/timelineStore.ts` | ✅ DONE | Full Zustand store with `subscribeWithSelector`. All layer CRUD, content frame CRUD with overlap validation, keyframe CRUD with auto-sort, playback navigation, frame rate conversion with duration maintenance, timeline auto-expand, view state, `createNewProject()`, `loadFromSessionData()` |
| §1.6 History action types | `src/types/index.ts` | ✅ DONE | 16 new types added: `layer_add`, `layer_remove`, `layer_reorder`, `layer_rename`, `layer_visibility`, `layer_opacity`, `content_frame_add/remove/timing/data`, `keyframe_add/remove/update`, `property_track_add/remove`, `frame_rate_change` |
| §1.6a Timeline history hook | `src/hooks/useTimelineHistory.ts` | ✅ DONE | Follows `useAnimationHistory.ts` pattern — wraps all timeline mutations with `pushToHistory()` from `toolStore`. All layer, content frame, keyframe, property track, and frame rate operations wrapped. |
| §1.6b Compatibility adapter | `src/stores/animationStoreAdapter.ts` | ✅ DONE | Provides legacy `useAnimationStore` API backed by `timelineStore`. Syncs via `useTimelineStore.subscribe()`. Handles frame CRUD, batch ops, bulk import, selection, playback delegation, navigation. Marked with `__isAdapter: true`. |
| §1.7 Undo batching | — | ⬜ NOT STARTED | DragSession pattern defined in plan; will implement when UI drag operations are built (Phase 3) |
| §1.8 Testing checkpoint | `src/__tests__/*.test.ts`, `vitest.config.ts` | ✅ DONE | 127 tests across 4 files: timelineStore (58), easing (27), sessionMigration (26), useTimelineHistory (16). All passing. vitest + jsdom + @testing-library/react installed. |
| Plan cleanup: blendMode | `docs/LAYER_TIMELINE_REFACTOR_PLAN.md` | ✅ DONE | Removed stale `blendMode: 'normal'` from 3 guidance code examples (§1.5, §2.x, §7.4) |
| TypeScript verification | — | ✅ DONE | `npx tsc --noEmit` passes cleanly (exit 0). No errors in new files. |

### Phase 4-7: Not yet started

### Phase 4: Keyframe System (Partial)

| Task | File(s) | Status | Notes |
|------|---------|--------|-------|
| §4.1 Keyframe interpolation | `src/types/easing.ts` | ✅ DONE (Phase 1) | Newton-Raphson solver + `interpolateKeyframes()` with LUT caching. Lives in `easing.ts` not a separate file. |
| §4.2 Property value provider | `src/utils/layerCompositing.ts` | ✅ DONE (Phase 2) | `getPropertyValueAtFrame()` + `getTransformAtFrame()`. Utility fns, not a React hook. |
| §4.3 Live preview updates | `src/hooks/useCompositedCanvas.ts` | ✅ DONE (Phase 2) | `useMemo` re-composites on `layers`/`currentFrame`/`canvasCells` changes. |
| §4.4 Anchor point overlay | `src/components/features/AnchorPointOverlay.tsx` | ✅ DONE | Yellow crosshair at anchor+position. Motion path dots per frame. Shows when layer has transform tracks. Integrated in CanvasOverlay. |
| §4.5 useKeyframeableProperty hook | `src/hooks/useKeyframeableProperty.ts` | ✅ DONE | Reactive binding: `value`, `setValue` (auto keyframe), `toggleTrack`, `toggleKeyframe`, `isTracked`, `hasKeyframeAtCurrentFrame`. |
| §4.6 Keyframe icons in side panels | `LayerListItem.tsx` | ✅ DONE (Phase 3) | Inline diamond toggle per property track in expanded layer list. |
| §4.8 Pre-computed playback | — | ⬜ DEFERRED | Real-time compositing works; will optimize if perf becomes an issue. |
| §4.9 Layer-aware onion skinning | `src/hooks/useOnionSkinRenderer.ts` | ✅ DONE | Dual-mode: layer mode composites via `compositeLayersAtFrame()`, legacy mode uses `getFrameData()`. |
| Inverse transform for drawing tools | `src/utils/layerTransformUtils.ts`, `src/hooks/useDrawingTool.ts` | ✅ DONE | `screenToLocal()`, `localToScreen()`, `transformCellMapToLocal()`, `transformCellMapToScreen()`. Applied to all 9 drawing tools. |
| Inverse transform for selection tools | `src/stores/toolStore.ts`, `src/hooks/useCanvasState.ts`, `src/hooks/usePasteMode.ts` | ✅ DONE | Copy reads, move commit writes, paste commit, magic wand BFS all use inverse transform. |
| Selection constraint with transforms | `src/utils/selectionConstraint.ts` | ✅ DONE | `localToScreen()` in all constraint functions so drawing in local space respects screen-space selection masks. |
| Gradient preview forward transform | `src/components/features/CanvasOverlay.tsx` | ✅ DONE | `transformCellMapToScreen()` for preview display since gradient data is computed in local space. |

### Phase 2: Layer Data Model (Core)

| Task | File(s) | Status | Notes |
|------|---------|--------|-------|
| §2.1 Layer limits utility | `src/utils/layerLimits.ts` | ✅ DONE | `canAddLayer()`, `getImportableLayerCount()`, `getRemainingLayerCount()`, `registerSubscriptionLayerLimit()`. FREE_TIER_MAX_LAYERS=5, UNLIMITED_LAYERS=-1 sentinel. Uses `Math.min` for importable count. |
| §2.2 Layer limit hook | `src/hooks/useLayerLimit.ts` | ✅ DONE | React hook returning `{ maxLayers, canAddLayer, remainingLayers, layerCount, isUnlimited }` for UI components. |
| §2.1 Store limit integration | `src/stores/timelineStore.ts` | ✅ DONE | `addLayer()` returns `LayerId \| null` (null when limit reached). `duplicateLayer()` returns null when limit reached. Both log warning to console. |
| §2.4 Layer compositing engine | `src/utils/layerCompositing.ts` | ✅ DONE | `compositeLayersAtFrame()` — composites all visible layers at a frame with transform support (position, scale, rotation, opacity, anchor point). Solo mode, visibility filtering, bounds clipping, content frame gap handling. Utility fns: `getContentFrameAtTime()`, `getPropertyValueAtFrame()`, `getTransformAtFrame()`, `applyRotation()`, `getVisibleLayers()`, `isLayerEditable()`. |
| §2.3 Canvas store layer sync | `src/stores/canvasStore.ts` | ✅ DONE | Added `activeLayerId`, `isDirty`, `setActiveLayerId()`, `setDirty()`. Dirty tracking on `setCell`, `clearCell`, `clearCanvas`, `fillArea`. `setCanvasData()` does NOT mark dirty (used for sync-in from timeline). |
| §2.5 Composited canvas hook | `src/hooks/useCompositedCanvas.ts` | ✅ DONE | `useCompositedCanvas()` — provides `getCompositedCell(x,y)` for renderer. When layers exist, composites all layers substituting active layer's canvasStore cells (working copy). Falls back to raw canvasStore when no layers. |
| §2.5 Renderer integration | `src/hooks/useCanvasRenderer.ts` | ✅ DONE | Swapped `getCell()` → `getCellForRender()` from `useCompositedCanvas` in static cell drawing loop. Non-breaking: compositing only activates when layers array is non-empty. |
| §2.6 Active layer indicator | `src/components/features/ActiveLayerIndicator.tsx`, `src/App.tsx` | ✅ DONE | Displays `(Layer Name)` in editor header next to project name. Hidden when no layers. Added to App.tsx header center section. |
| §2.7 Drawing tool layer guard | `src/hooks/useDrawingTool.ts` | ✅ DONE | `checkActiveLayerEditable()` — blocks drawing on locked/invisible layers with toast notification. Guards on `drawAtPosition`, `drawRectangle`, `drawEllipse`. Allows eyedropper (read-only). Passes through in v1 mode (no layers). |
| §2.8 Testing checkpoint | `src/__tests__/layerLimits.test.ts`, `src/__tests__/layerCompositing.test.ts`, `src/__tests__/canvasStoreLayerSync.test.ts` | ✅ DONE | 78 tests across 3 files: layerLimits (23), layerCompositing (40), canvasStoreLayerSync (15). All passing. Combined with Phase 1: 205/205 tests pass. |
| TypeScript verification | — | ✅ DONE | `npx tsc --noEmit` passes cleanly. No errors in new/modified files. |

### Phase 3-7: Not yet started

### Phase 3: Timeline UI

| Task | File(s) | Status | Notes |
|------|---------|--------|-------|
| §3.1 Resizable bottom panel | `src/components/features/timeline/TimelineResizeHandle.tsx`, `src/pages/EditorPage.tsx` | ✅ DONE | Drag handle at top of bottom panel. Min 140px, max 600px. Syncs to `panelHeight` in timeline store. Cursor feedback + visual indicator. |
| §3.2 Tab container + toolbar | `src/components/features/TimelinePanel.tsx`, `src/components/features/timeline/TimelineToolbar.tsx` | ✅ DONE | TimelinePanel wraps tabs (Timeline/Frames). Timeline tab: 3-column layout (LayerList \| ruler+tracks \| optional KeyframeEditorPanel). Frames tab: existing AnimationTimeline. TimelineToolbar: add layer, play/pause/prev/next/first/last/loop buttons, frame counter. |
| §3.3 Layer list panel | `src/components/features/timeline/LayerList.tsx` | ✅ DONE | Left sidebar (w-52) showing layers in visual z-order (reversed from store array). Native HTML5 drag-and-drop reordering with index conversion. |
| §3.4 Layer list item | `src/components/features/timeline/LayerListItem.tsx` | ✅ DONE | Row with: visibility (eye), solo (S), lock, name (double-click edit via Input), expand arrow, keyframe indicator dot, delete button (hidden when 1 layer). Expanded state shows property track labels. |
| §3.7 Timeline ruler | `src/components/features/timeline/TimelineRuler.tsx` | ✅ DONE | Frame ruler with adaptive tick intervals based on zoom (1/2/5/fps/2fps). Major/minor ticks, time labels (seconds/minutes). Click-to-seek. Red playhead line + circle. |
| §3.8 Track area + content frames | `src/components/features/timeline/TimelineTrackArea.tsx`, `src/components/features/timeline/ContentFrameBlock.tsx` | ✅ DONE | Horizontally scrollable area with Ctrl+scroll zoom. ContentFrameBlock: click-select (purple), shift-click multi-select, drag-to-reorder (slot-snap + free in gaps), ghost preview, cross-layer drag via `data-layer-id`. Per-layer ghost/indicator rendering. Edge-drag to resize. Drop: park→move-others→place→trim. BASE_PX_PER_FRAME=12. |
| §3.9 Keyframe diamonds | `src/components/features/timeline/KeyframeDiamond.tsx` | ✅ DONE | Rotated square on property tracks. Click to select + open editor. Drag to move in time. Yellow color, brighter when selected. |
| §3.10 Keyframe editor panel | `src/components/features/timeline/KeyframeEditorPanel.tsx` | ✅ DONE | Right panel (w-64) for editing selected keyframe. Shows: property definition, frame input, value input (with min/max/step), EasingCurveEditor, loop toggle, delete button. Finds keyframe by ID across all layers/tracks. |
| §3.11 Easing curve editor | `src/components/features/timeline/EasingCurveEditor.tsx` | ✅ DONE | Interactive SVG canvas (160×160) for cubic bezier curves. Draggable control points (P1/P2) with overshoot support (y -0.5 to 1.5). Grid, diagonal reference line, control handle lines. 8 preset buttons with mini curve previews. Active preset detection. |
| §3.12 Timecode display | `src/components/features/timeline/TimecodeDisplay.tsx` | ✅ DONE | Dropdown format selector: timecode (MM:SS:FF), frames (F##), seconds (##.##s), milliseconds (####ms). Extracted `formatTimecodeValue()` pure function for testing. |
| §3.1 EditorPage integration | `src/pages/EditorPage.tsx` | ✅ DONE | Swapped `AnimationTimeline` → `TimelinePanel` in bottom panel. Added `TimelineResizeHandle` inside CollapsiblePanel. |
| §3.13 Testing checkpoint | `src/__tests__/timelineUI.test.ts` | ✅ DONE | 92 tests across 11 describe blocks: timecode formatting (19), tick intervals (8), frame labels (8), store view state (20), easing presets (7), layer toggles (4), layer reordering (3), content frame timing (5), keyframe operations (5), playback controls (8), pixel calculations (5). All passing. Combined total: 297/297 tests pass. |
| TypeScript verification | — | ✅ DONE | `npx tsc --noEmit` passes cleanly. Zero errors across all new/modified files. |

### Key File Inventory (Phase 3 + Post-Phase 3 Polish)

| File | Lines | Purpose |
|------|-------|---------|
| `src/components/features/TimelinePanel.tsx` | ~135 | Main wrapper: tabs, layout, zoom slider footer |
| `src/components/features/timeline/TimelineToolbar.tsx` | ~384 | 3-column: frame ops + centered playback + counter |
| `src/components/features/timeline/TimecodeDisplay.tsx` | ~68 | Timecode format display + selector |
| `src/components/features/timeline/LayerList.tsx` | ~123 | Layer list + pinned Add Layer footer |
| `src/components/features/timeline/LayerListItem.tsx` | ~341 | Layer row with all controls |
| `src/components/features/timeline/TimelineRuler.tsx` | ~197 | Every-frame ticks, drag-to-seek, purple end bracket |
| `src/components/features/timeline/TimelineTrackArea.tsx` | ~199 | Scrollable tracks, per-layer ghost/indicator |
| `src/components/features/timeline/ContentFrameBlock.tsx` | ~292 | Select, shift-click, slot-snap drag, cross-layer, ghost, resize |
| `src/components/features/timeline/KeyframeDiamond.tsx` | ~87 | Clickable/draggable keyframe marker |
| `src/components/features/timeline/KeyframeEditorPanel.tsx` | ~151 | Keyframe property editor panel |
| `src/components/features/timeline/EasingCurveEditor.tsx` | ~351 | Interactive bezier curve editor + presets |
| `src/components/features/timeline/TimelineResizeHandle.tsx` | ~90 | Drag handle for panel resizing |
| `src/pages/EditorPage.tsx` | ~216 | Modified: TimelinePanel + resize handle |
| `src/__tests__/timelineUI.test.ts` | ~737 | 92 tests for Phase 3 components |

| File | Lines | Purpose |
|------|-------|---------|
| `src/types/timeline.ts` | ~575 | Types + `selectedContentFrameIds`, `contentFrameDragPreview` |
| `src/types/easing.ts` | ~200 | Cubic bezier solver, LUT cache, interpolation |
| `src/utils/sessionMigration.ts` | ~200 | v1→v2 migration, validation |
| `src/stores/timelineStore.ts` | ~1005 | Store + `splitContentFrame`, `duplicateContentFrame`, selection, drag preview |
| `src/stores/animationStoreAdapter.ts` | ~646 | Legacy API shim + layer-aware `getFrameData`/`setFrameData` |
| `src/hooks/useTimelineHistory.ts` | ~618 | Undo/redo wrapper + split/duplicate wrappers |
| `src/hooks/useFrameSynchronization.ts` | ~337 | Layer-aware sync + layer-switch + `effectiveFrameIndex` |
| `src/hooks/useOptimizedPlayback.ts` | ~282 | Dual-mode playback: timeline compositing + legacy |
| `src/hooks/useFrameNavigation.ts` | ~103 | Dual-mode navigation: timeline vs legacy store |
| `src/hooks/useCompositedCanvas.ts` | ~102 | Composited cell provider for renderer |
| `src/stores/playbackOnlyStore.ts` | ~152 | Non-React playback state |
| `src/utils/layerCompositing.ts` | ~288 | Multi-layer compositing engine with transforms |
| `src/utils/directCanvasRenderer.ts` | ~185 | Direct canvas rendering for playback |
| `src/types/index.ts` | modified (~796) | +16 history action types & interfaces |
| `vitest.config.ts` | ~30 | Test runner configuration |
| `src/__tests__/timelineStore.test.ts` | ~400 | 58 tests |
| `src/__tests__/easing.test.ts` | ~230 | 27 tests |
| `src/__tests__/sessionMigration.test.ts` | ~260 | 26 tests |
| `src/__tests__/useTimelineHistory.test.ts` | ~260 | 16 tests |

### Key File Inventory (Phase 2)

| File | Lines | Purpose |
|------|-------|---------|
| `src/utils/layerLimits.ts` | ~75 | Layer limit checking & subscription tier integration |
| `src/hooks/useLayerLimit.ts` | ~35 | React hook for layer limit info in UI components |
| `src/utils/layerCompositing.ts` | ~288 | Multi-layer compositing engine with transforms |
| `src/hooks/useCompositedCanvas.ts` | ~102 | Composited cell provider for renderer |
| `src/components/features/ActiveLayerIndicator.tsx` | ~20 | Active layer name display in header |
| `src/stores/canvasStore.ts` | ~270 | Modified: +activeLayerId, isDirty, layer sync actions |
| `src/stores/timelineStore.ts` | ~838 | Modified: +layer limit checks on addLayer/duplicateLayer |
| `src/hooks/useCanvasRenderer.ts` | modified | Swapped getCell → getCellForRender for compositing |
| `src/hooks/useDrawingTool.ts` | modified | +checkActiveLayerEditable guard on all draw entry points |
| `src/App.tsx` | modified | +ActiveLayerIndicator in editor header |
| `src/__tests__/layerLimits.test.ts` | ~230 | 23 tests: limit enforcement, tier integration, store integration |
| `src/__tests__/layerCompositing.test.ts` | ~430 | 40 tests: compositing, visibility, solo, opacity, transforms, gaps |
| `src/__tests__/canvasStoreLayerSync.test.ts` | ~170 | 15 tests: dirty tracking, activeLayerId, sync patterns |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-01 | Copilot | Initial plan |
| 1.1.0 | 2026-02-02 | Copilot | Added: State synchronization architecture, Frame View specification, content frame gap behavior (blank), drawing/selection tool layer interaction rules, undo/redo batching strategy, layer playback store architecture, onion skinning layer toggle, timeline auto-expand behavior, frame duration dialog, frame rate conversion, new project default state (1 layer, 1 frame, 12 FPS), layer group serialization, comprehensive unit/integration/edge case/performance tests. Fixed: rotation from 90° to 1° throughout. |
| 1.2.0 | 2026-02-02 | Copilot | Fixed: Removed duplicate section 2.8 (Selection Tool Layer Targeting). Fixed Phase 4 section numbering (4.10→4.7). Added `parentGroupId` to `SessionLayerV2` interface. Added `layerGroups` to timeline store initial state. Added layer group management actions to store interface. Added `isDirty` to canvas store interface. Added `animationStore` deprecation plan. Added minimum layer count decision (always ≥1 layer). Clarified 12 FPS default for NEW projects only. Added purpose text to Effect Scope Toggle (6.4). |
| 1.3.0 | 2026-02-05 | Copilot | Risk & performance hardening pass. Added: memory thresholds and LRU fallback to playback store (MAX_PRECOMPUTE_FRAMES=500, LRU_CACHE_SIZE=100), `beforeunload`/periodic/visibility sync guards to prevent data loss, full Newton-Raphson bezier solver with iteration limits and LUT caching for common presets, content frame overlap validation on `addContentFrame`/`updateContentFrameTiming`, centralized layer limit enforcement via `src/utils/layerLimits.ts` with all 6 creation paths enumerated, dynamic cell aspect ratio from font metrics replacing hardcoded 0.6, transform composition unit test table (8 cases). Added new sections: Error Recovery (safe compositing wrapper, playback skip, import data repair), Progressive Loading (async chunked import with progress callback), Accessibility (keyboard navigation, ARIA attributes, focus management). Expanded keyboard shortcuts from placeholder to 14 concrete bindings. Fixed Resolved Design Decisions numbering. Added 4 new risks to Risks & Mitigations table. |
| 2.0.0 | 2026-02-06 | Copilot | **Major revision based on codebase audit.** Fixed 4 factual errors: `historyStore.ts` → `toolStore.ts` (undo/redo lives there), `MainLayout.tsx` → `EditorPage.tsx`, `subscriptionStore.ts` → premium Stripe hooks, and missing `useAnimationHistory.ts` (461 lines). Added: `animationStore` compatibility adapter (§1.6b) for 47-file migration, `useTimelineHistory` hook migration (§1.6a), `useFrameSynchronization` full rewrite to unidirectional `useLayerCanvasSync` (§6.4a), `timeEffectsStore` migration plan (§6.4b), generator migration detail (§6.4c), MCP `ProjectStateManager` migration (§6.4d), dynamic memory budgeting with LRU cache. Restructured: Phase 2 → "Layer Data Model (Core)" with advanced features deferred; new Phase 7: Advanced Layer Features (Layer Groups, Apply-to-All-Layers, Multi-layer Selection, Merge Layers). Updated Phase 3 estimate from 3-4 weeks → 5-6 weeks. Massively expanded Branching & Deployment Safety Strategy with: phase sub-branches, Vercel configuration safety, cross-repository coordination table, rollback plan, pre-merge checklist, hotfix protocol. Updated File Change Matrix with 7 new entries. Added 9 new risks to Risks & Mitigations table. Updated estimated duration to 16-22 weeks. Success probability: 55-60% → 80-85% with adjustments. |
| 2.0.1 | 2026-02-05 | Copilot | **Phase 1 implementation started.** Created `phase-1/foundation` branch. Implemented: `src/types/timeline.ts` (all type definitions, branded IDs, helpers), `src/types/easing.ts` (Newton-Raphson cubic bezier solver with LUT caching), `src/utils/sessionMigration.ts` (v1→v2 migration, validation & repair), `src/stores/timelineStore.ts` (full Zustand store, ~825 lines), `src/hooks/useTimelineHistory.ts` (undo/redo wrapper hook), `src/stores/animationStoreAdapter.ts` (legacy API compatibility shim). Added 16 history action types to `src/types/index.ts`. Removed stale `blendMode: 'normal'` from 3 code examples. Added Implementation Progress section. TypeScript compilation verified clean. |
| 2.0.2 | 2026-02-06 | Copilot | **Phase 1 testing checkpoint complete.** Installed vitest + jsdom + @testing-library/react. Created `vitest.config.ts` with jsdom env, path aliases, v8 coverage. Added `test`/`test:run`/`test:coverage` scripts to `package.json`. Wrote 127 tests across 4 files (timelineStore: 58, easing: 27, sessionMigration: 26, useTimelineHistory: 16). All passing. Added Vitest Infrastructure section to Testing Strategy with test patterns, naming conventions, and per-phase checklist template for reuse in later phases. |
| 2.1.0 | 2026-02-06 | Copilot | **Phase 2: Layer Data Model (Core) complete.** Created `phase-2/layer-data-model` branch (off `timeline-refactor`, Phase 1 merged in). New files: `src/utils/layerLimits.ts` (subscription-tier-aware layer limit enforcement), `src/hooks/useLayerLimit.ts` (React hook), `src/utils/layerCompositing.ts` (multi-layer compositing engine with position/scale/rotation/opacity/anchor transforms, solo mode, visibility filtering, content frame gap handling), `src/hooks/useCompositedCanvas.ts` (renderer-facing composited cell provider), `src/components/features/ActiveLayerIndicator.tsx` (header display). Modified: `src/stores/timelineStore.ts` (addLayer/duplicateLayer return null at limit), `src/stores/canvasStore.ts` (+activeLayerId, isDirty, layer sync state), `src/hooks/useCanvasRenderer.ts` (getCell→getCellForRender swap), `src/hooks/useDrawingTool.ts` (+locked/invisible layer guards with toast), `src/App.tsx` (+ActiveLayerIndicator). Fixed `getImportableLayerCount()` to use `Math.min(incoming, available)`. 78 new tests (layerLimits: 23, layerCompositing: 40, canvasStoreLayerSync: 15). Total: 205/205 tests passing. TypeScript clean. |
| 2.2.0 | 2026-02-06 | Copilot | **Phase 3: Timeline UI complete.** 12 new components, 92 new tests. Total: 297/297. TypeScript clean. |
| 2.3.0 | 2026-02-06 | Copilot | **Post-Phase 3: Playback & Timeline Polish.** Dual-mode playback (timeline compositing + legacy). Fixed adapter `play()`/`pause()`/`stop()`. Dual-mode `useFrameNavigation`. Space key in both tabs. Drag-to-scrub ruler. Pause preserves frame. Canvas data isolation per layer (layer-aware `useFrameSynchronization` with `effectiveFrameIndex` + layer-switch flush/load). Content frame CRUD: add/duplicate/split/delete in toolbar with `splitContentFrame()`/`duplicateContentFrame()` in store + history. Every-frame ruler ticks. Purple draggable end bracket. 3-column toolbar layout. Loop purple. Add Layer pinned footer. Content frame selection (`selectedContentFrameIds`). Drag-to-reorder with slot-snap, ghost preview, cross-layer drag, per-layer rendering. Zoom slider. Default zoom 3x, panel 264px. 297/297 tests. TypeScript clean. |
| 2.4.0 | 2026-02-07 | Copilot | **Phase 4: Keyframe System (partial).** Built `useKeyframeableProperty` hook (reactive property→keyframe binding). Built `AnchorPointOverlay` (crosshair + motion path, integrated in CanvasOverlay). Upgraded `useOnionSkinRenderer` for layer-aware compositing. **Transform-aware coordinate system** (major architectural addition): Created `src/utils/layerTransformUtils.ts` with `screenToLocal()`, `localToScreen()`, `transformCellMapToLocal()`, `transformCellMapToScreen()`, `inverseTransformPoint()`. Added `inverseTransformPoint()` to `layerCompositing.ts`. Fixed ALL 9 drawing tools: pencil, eraser, fill, rectangle, ellipse, gradient, bezier, text, ASCII type/box — each applies inverse transform before canvas writes. Fixed brush smoothing gap-fill coordinate mismatch. Fixed all 3 selection tool copy/move/paste operations. Fixed magic wand flood fill BFS. Fixed selection constraint checks (`localToScreen()` in `selectionConstraint.ts`). Fixed gradient preview rendering (`transformCellMapToScreen()`). Added Coordinate Space Architecture section to plan. 297/297 tests. TypeScript clean. |
