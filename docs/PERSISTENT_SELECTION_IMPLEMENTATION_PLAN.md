# Persistent Selection System Implementation Plan

## 📋 Overview

This document outlines the implementation plan for a major architectural change to ASCII Motion's selection system. The goal is to make selections **persistent across tool changes**, allowing drawing tools and effects to operate **only within the active selection bounds**.

### Current Behavior (To Be Changed)
- Selections are cleared when switching to non-selection tools
- Drawing tools apply to any cell on the canvas
- Effects apply to entire canvas or timeline
- Each selection type (rect, lasso, wand) is independent

### New Behavior (Target)
- Selections persist until explicitly deselected by the user
- Drawing tools and effects only apply within selection bounds when active
- Selection types can be combined/subtracted (cross-tool modifier support)
- Enhanced visual feedback for constrained operations

---

## 🎯 Requirements Summary

Based on user requirements:

| Feature | Behavior |
|---------|----------|
| **Deselection** | Escape key, Cmd/Ctrl+D, or click outside selection (only when selection tool is active) |
| **Selection Visibility** | Marching ants at 50% opacity when non-selection tool is active |
| **Drawing Constraint** | All drawing tools only affect cells within selection bounds |
| **Effects Constraint** | Effects only apply within selection; selection persists for "apply to all frames" |
| **Selection Modification** | Must switch to selection tool to modify selection |
| **Copy/Paste/Arrow Move** | Works regardless of active tool when selection exists |
| **Click-Drag Move** | Only works when selection tool is active |
| **Cross-Tool Selection** | Can combine/subtract selections across rect, lasso, wand tools |
| **Fill Tools** | Paint bucket and gradient only fill within selected cells |
| **Blocked Actions** | Ignored silently (no visual feedback for clicks outside selection) |

---

## 🏗️ Architecture Changes

### Phase 1: Unified Selection State

#### 1.1 Create Global Selection Store

Instead of three separate selection states, create a **unified selection system** that can hold the combined result of multiple selection operations.

**New file: `src/stores/selectionStore.ts`**

```typescript
interface GlobalSelectionState {
  // The unified set of selected cell keys (e.g., "x,y")
  selectedCells: Set<string>;
  
  // Whether any selection is active
  isActive: boolean;
  
  // The bounding box of the selection (for quick hit testing)
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
  
  // For move operations - the content being moved
  moveState: MoveState | null;
  
  // Clipboard for copy/paste
  clipboard: Map<string, Cell> | null;
  clipboardBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  
  // Actions
  setSelection: (cells: Set<string>) => void;
  addToSelection: (cells: Set<string>) => void;
  subtractFromSelection: (cells: Set<string>) => void;
  clearSelection: () => void;
  
  // Move operations
  startMove: (startPos: { x: number; y: number }, canvasData: Map<string, Cell>) => void;
  updateMove: (currentPos: { x: number; y: number }) => void;
  commitMove: (canvasData: Map<string, Cell>) => Map<string, Cell>;
  cancelMove: () => void;
  
  // Clipboard operations
  copySelection: (canvasData: Map<string, Cell>) => void;
  getClipboard: () => Map<string, Cell> | null;
  
  // Utility
  isCellSelected: (x: number, y: number) => boolean;
  getBounds: () => { minX: number; minY: number; maxX: number; maxY: number } | null;
}
```

#### 1.2 Migrate Existing Selection State

The current `toolStore.ts` has:
- `selection` (rectangular)
- `lassoSelection`
- `magicWandSelection`

These will be **deprecated** in favor of the unified `selectionStore`. The individual tool hooks will still calculate their selection sets, but will feed into the global store.

**Migration strategy:**
1. Create `selectionStore.ts` with unified state
2. Modify each selection hook to update global store instead of tool store
3. Keep tool-specific state for drawing (e.g., lasso path during drawing)
4. Remove selection clearing from `setActiveTool()`

---

### Phase 2: Tool Switching Without Selection Clear

#### 2.1 Modify `setActiveTool()` in `toolStore.ts`

**Current code (lines 393-403):**
```typescript
// Clear selections when switching tools (except select/lasso/magicwand tools)
if (tool !== 'select') {
  get().clearSelection();
}
if (tool !== 'lasso') {
  get().clearLassoSelection();
}
if (tool !== 'magicwand') {
  get().clearMagicWandSelection();
}
```

**New behavior:**
```typescript
// REMOVED: Selection clearing on tool switch
// Selections now persist until explicitly cleared by user

// Clear tool-specific DRAWING state (not selection state)
if (previousTool === 'lasso' && tool !== 'lasso') {
  // Clear lasso PATH if user was mid-draw, but keep selected cells
  get().clearLassoPath(); // New action - only clears path, not selection
}
```

#### 2.2 Add Explicit Deselect Actions

**New hotkey: Cmd/Ctrl+D for "Deselect All"**

Add to `src/constants/hotkeys.ts`:
```typescript
{ key: 'd', ctrlKey: true, action: 'deselectAll', description: 'Deselect all' }
```

Add handler in `useKeyboardShortcuts.ts`:
```typescript
case 'deselectAll':
  selectionStore.clearSelection();
  break;
```

**Escape key handling:**
```typescript
case 'Escape':
  if (selectionStore.isActive) {
    selectionStore.clearSelection();
  }
  break;
```

---

### Phase 3: Selection-Constrained Drawing

#### 3.1 Create Selection Constraint Utility

**New file: `src/utils/selectionConstraint.ts`**

```typescript
import { useSelectionStore } from '../stores/selectionStore';

/**
 * Check if a cell is within the active selection
 * Returns true if no selection is active (unconstrained) or if cell is selected
 */
export function isCellDrawable(x: number, y: number): boolean {
  const { isActive, isCellSelected } = useSelectionStore.getState();
  
  // If no selection, all cells are drawable
  if (!isActive) return true;
  
  // If selection exists, only selected cells are drawable
  return isCellSelected(x, y);
}

/**
 * Filter a set of cells to only those within the active selection
 */
export function constrainCellsToSelection(
  cells: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  const { isActive, isCellSelected } = useSelectionStore.getState();
  
  if (!isActive) return cells;
  
  return cells.filter(({ x, y }) => isCellSelected(x, y));
}

/**
 * Filter a Map of cells to only those within the active selection
 */
export function constrainCellMapToSelection(
  cells: Map<string, Cell>
): Map<string, Cell> {
  const { isActive, selectedCells } = useSelectionStore.getState();
  
  if (!isActive) return cells;
  
  const constrained = new Map<string, Cell>();
  cells.forEach((cell, key) => {
    if (selectedCells.has(key)) {
      constrained.set(key, cell);
    }
  });
  return constrained;
}
```

#### 3.2 Modify Drawing Tools

**`useDrawingTool.ts` modifications:**

```typescript
// In drawAtPosition()
const drawAtPosition = useCallback((x: number, y: number, isShiftClick = false, toolOverride?: string) => {
  // NEW: Check if cell is within selection constraint
  if (!isCellDrawable(x, y)) {
    return; // Silently ignore - cell is outside selection
  }
  
  // ... existing drawing logic
}, [...]);

// In applyBrushStroke()
const applyBrushStroke = useCallback((toolKey: 'pencil' | 'eraser', centerX: number, centerY: number) => {
  const brushCells = calculateBrushCells(...);
  
  // NEW: Filter brush cells to only those within selection
  const constrainedCells = constrainCellsToSelection(brushCells);
  
  if (toolKey === 'eraser') {
    constrainedCells.forEach(({ x, y }) => {
      clearCell(x, y);
    });
  } else {
    constrainedCells.forEach(({ x, y }) => {
      const newCell = createCellWithToggles(x, y);
      setCell(x, y, newCell);
    });
  }
}, [...]);
```

**Paint bucket modifications in `canvasStore.ts`:**

```typescript
// In fillArea()
fillArea: (x, y, newCell, contiguous, matchCriteria, affectsCriteria) => {
  const { isActive, selectedCells } = useSelectionStore.getState();
  
  // ... existing flood fill logic
  
  // NEW: When applying the fill, only affect selected cells
  matchingCells.forEach((cellKey) => {
    // Skip if selection is active and cell is not selected
    if (isActive && !selectedCells.has(cellKey)) {
      return;
    }
    // Apply fill
    newCells.set(cellKey, newCellData);
  });
}
```

#### 3.3 Modify Shape Drawing (Rectangle, Ellipse)

**`useCanvasDragAndDrop.ts` modifications:**

```typescript
// In drawRectangle() / drawEllipse()
const drawRectangle = useCallback((startX, startY, endX, endY, filled) => {
  const rectangleCells = calculateRectangleCells(startX, startY, endX, endY, filled);
  
  // NEW: Filter to selection
  const constrainedCells = constrainCellsToSelection(rectangleCells);
  
  constrainedCells.forEach(({ x, y }) => {
    setCell(x, y, newCell);
  });
}, [...]);
```

---

### Phase 4: Selection-Constrained Effects

#### 4.1 Modify Effects Processing

**`effectsProcessing.ts` modifications:**

```typescript
export async function processEffect(
  effectType: EffectType,
  cells: Map<string, Cell>,
  settings: EffectSettings,
  canvasBackgroundColor: string,
  selectionMask?: Set<string> // NEW: Optional selection constraint
): Promise<EffectProcessingResult> {
  
  // NEW: If selection mask provided, only process those cells
  const cellsToProcess = selectionMask 
    ? constrainCellMapToSelection(cells, selectionMask)
    : cells;
  
  // Process effect on constrained cells
  const processedCells = await processEffectInternal(effectType, cellsToProcess, settings);
  
  // Merge back with unprocessed cells
  const finalCells = new Map(cells);
  processedCells.forEach((cell, key) => {
    finalCells.set(key, cell);
  });
  
  return { success: true, processedCells: finalCells };
}
```

#### 4.2 Modify Effects Store to Pass Selection

**`effectsStore.ts` modifications:**

```typescript
applyEffect: async (effect: EffectType): Promise<boolean> => {
  // ... existing setup
  
  // NEW: Get current selection state
  const { isActive, selectedCells } = useSelectionStore.getState();
  const selectionMask = isActive ? selectedCells : undefined;
  
  if (state.applyToTimeline) {
    // Apply to timeline - pass same selection mask to all frames
    const result = await processEffectOnFrames(
      effect,
      animationStore.frames,
      settings,
      progressCallback,
      canvasBackgroundColor,
      selectionMask // NEW: Pass selection to constrain each frame
    );
    // ...
  } else {
    // Apply to current canvas
    const result = await processEffect(
      effect,
      canvasStore.cells,
      settings,
      canvasBackgroundColor,
      selectionMask // NEW: Pass selection constraint
    );
    // ...
  }
}
```

---

### Phase 5: Cross-Tool Selection Combining

#### 5.1 Modifier Key Support for Selection Tools

When user has an existing selection and switches to a different selection tool:
- **No modifier**: Replace selection
- **Shift**: Add to selection
- **Option/Alt**: Subtract from selection

**Modification to selection tool hooks:**

```typescript
// In useCanvasSelection.ts, useCanvasLassoSelection.ts, useCanvasMagicWandSelection.ts

const handleSelectionComplete = useCallback((newSelectedCells: Set<string>) => {
  const { isActive, selectedCells, addToSelection, subtractFromSelection, setSelection } = useSelectionStore.getState();
  
  // Check modifier keys
  if (shiftKeyDown) {
    // Add mode
    addToSelection(newSelectedCells);
  } else if (altKeyDown) {
    // Subtract mode
    subtractFromSelection(newSelectedCells);
  } else {
    // Replace mode
    setSelection(newSelectedCells);
  }
}, [shiftKeyDown, altKeyDown]);
```

#### 5.2 Visual Indicator for Modifier Mode

When hovering with a selection tool while Shift or Alt is held, show indicator in status bar:
- Shift: "Add to Selection"
- Alt: "Subtract from Selection"

---

### Phase 6: Visual Updates for Persistent Selection

#### 6.1 Reduced Opacity When Non-Selection Tool Active

**`CanvasOverlay.tsx` or `CanvasRenderer.tsx` modifications:**

```typescript
// Determine selection overlay opacity based on active tool
const isSelectionToolActive = ['select', 'lasso', 'magicwand'].includes(activeTool);
const selectionOpacity = isSelectionToolActive ? 1.0 : 0.5;

// Apply opacity to marching ants rendering
ctx.globalAlpha = selectionOpacity;
renderMarchingAnts(ctx, selectedCells);
ctx.globalAlpha = 1.0; // Reset
```

#### 6.2 Click Outside Behavior

**Only clear selection if:**
1. A selection tool is active, AND
2. User clicks outside the selection bounds, AND
3. No modifier keys are held (Shift/Alt would start a new additive/subtractive selection)

```typescript
// In useCanvasSelection.ts handleSelectionMouseDown()
const handleSelectionMouseDown = useCallback((event) => {
  const { x, y } = getGridCoordinatesFromEvent(event);
  const { isActive, isCellSelected, clearSelection } = useSelectionStore.getState();
  
  // Check if clicking outside existing selection
  if (isActive && !isCellSelected(x, y)) {
    // No modifier - clear and start new selection
    if (!event.shiftKey && !event.altKey) {
      clearSelection();
    }
  }
  
  // Continue with normal selection logic...
}, [...]);
```

---

### Phase 7: Keyboard Shortcuts Update

#### 7.1 Arrow Key Movement (Any Tool)

Arrow keys should move selection content when:
- A selection is active
- Content has been "lifted" (move state exists)

**Current behavior**: Only works when selection tool is active
**New behavior**: Works with any tool active, as long as selection exists

```typescript
// In useKeyboardShortcuts.ts
case 'ArrowUp':
case 'ArrowDown':
case 'ArrowLeft':
case 'ArrowRight':
  const { isActive, moveState, startMove } = useSelectionStore.getState();
  if (isActive) {
    if (!moveState) {
      // Lift content for first arrow key press
      startMove({ x: 0, y: 0 }, canvasStore.cells);
    }
    // Apply arrow movement
    updateMove(calculateArrowOffset(key, moveState));
  }
  break;
```

#### 7.2 Copy/Paste (Any Tool)

Copy and paste should work when selection exists, regardless of active tool.

**No changes needed** - current implementation already checks for selection state, not active tool.

---

### Phase 8: Frame Change Handling

#### 8.1 Selection Behavior on Frame Change

When the user changes frames (via timeline click, keyboard shortcut, or playback):

**Expected Behavior:**
1. If a **move operation is in progress**, commit it to the current frame before switching
2. The **selection itself persists** and remains in the same location on the new frame
3. The selection bounds apply to the new frame's content

**Why this matters:**
- Users may want to apply the same operation to multiple frames in sequence
- Selection represents a "region of interest" that is frame-independent
- Move operations are frame-specific and must be committed before leaving

#### 8.2 Implementation

**Modify `useFrameSynchronization.ts`:**

```typescript
// Listen for frame changes and handle selection/move state
useEffect(() => {
  const handleFrameChange = (prevFrameIndex: number, newFrameIndex: number) => {
    const { moveState, commitMove, isActive } = useSelectionStore.getState();
    
    // If there's a pending move operation, commit it to the previous frame
    if (moveState) {
      // Commit the move to the canvas (which is still showing previous frame data)
      const newCanvasData = commitMove(canvasStore.cells);
      
      // Save to the previous frame before switching
      animationStore.setFrameData(prevFrameIndex, newCanvasData);
    }
    
    // Selection itself persists - no action needed
    // The selectedCells Set remains unchanged
    // It will now apply to the new frame's content
  };
  
  // Subscribe to frame index changes
  const unsubscribe = useAnimationStore.subscribe(
    (state) => state.currentFrameIndex,
    (newIndex, prevIndex) => {
      if (newIndex !== prevIndex) {
        handleFrameChange(prevIndex, newIndex);
      }
    }
  );
  
  return () => unsubscribe();
}, []);
```

#### 8.3 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Frame change with active selection, no move | Selection persists on new frame |
| Frame change with move in progress | Commit move to current frame, selection persists on new frame |
| Playback starts with active selection | Commit any pending move, clear selection (playback mode) |
| Frame change via arrow keys | Same as timeline click - commit move if pending |
| Undo after frame change | Should undo the committed move on the previous frame |

#### 8.4 Selection Store Update

Add frame-change handler to selection store:

```typescript
interface GlobalSelectionState {
  // ... existing state
  
  // Frame change handling
  onFrameWillChange: (currentFrameIndex: number, canvasData: Map<string, Cell>) => Map<string, Cell> | null;
}

// Implementation
onFrameWillChange: (currentFrameIndex, canvasData) => {
  const { moveState } = get();
  
  if (moveState) {
    // Commit the move and return the new canvas data
    const newData = get().commitMove(canvasData);
    return newData;
  }
  
  // No move in progress, no changes needed
  return null;
}
```

---

## 📁 Files to Modify

### New Files
| File | Purpose |
|------|---------|
| `src/stores/selectionStore.ts` | Unified global selection state |
| `src/utils/selectionConstraint.ts` | Utility functions for constraining operations to selection |

### Modified Files (High Impact)
| File | Changes |
|------|---------|
| `src/stores/toolStore.ts` | Remove selection clearing from `setActiveTool()`, deprecate individual selection states |
| `src/hooks/useDrawingTool.ts` | Add selection constraint checks to all drawing functions |
| `src/hooks/useCanvasDragAndDrop.ts` | Add selection constraint to rectangle/ellipse drawing |
| `src/stores/canvasStore.ts` | Modify `fillArea()` to respect selection |
| `src/stores/effectsStore.ts` | Pass selection mask to effect processing |
| `src/utils/effectsProcessing.ts` | Add selection constraint parameter to all effect functions |

### Modified Files (Medium Impact)
| File | Changes |
|------|---------|
| `src/hooks/useCanvasSelection.ts` | Update to use global selection store, add cross-tool support |
| `src/hooks/useCanvasLassoSelection.ts` | Update to use global selection store, add cross-tool support |
| `src/hooks/useCanvasMagicWandSelection.ts` | Update to use global selection store, add cross-tool support |
| `src/hooks/useKeyboardShortcuts.ts` | Add Cmd+D deselect, update arrow key handling |
| `src/constants/hotkeys.ts` | Add deselect hotkey |
### Modified Files (Medium Impact)
| File | Changes |
|------|---------||
| `src/hooks/useFrameSynchronization.ts` | Add frame change handler for move commit and selection persistence |
### Modified Files (Low Impact)
| File | Changes |
|------|---------|
| `src/components/features/CanvasOverlay.tsx` | Adjust selection opacity based on active tool |
| `src/hooks/useCanvasMouseHandlers.ts` | Update click-outside handling |
| `src/hooks/useGradientFillTool.ts` | Add selection constraint to gradient application |

---

## 🔄 Migration Strategy

### Step 1: Create Infrastructure (Non-Breaking)
1. Create `selectionStore.ts` with full API
2. Create `selectionConstraint.ts` utilities
3. Add new hotkey constant for Cmd+D
4. **Test**: Verify new store works in isolation

### Step 2: Wire Up Selection Hooks (Parallel Operation)
1. Modify selection hooks to ALSO update global store
2. Keep existing tool store selection state working
3. **Test**: Verify both systems stay in sync

### Step 3: Switch Drawing Tools to Global Store
1. Update `useDrawingTool.ts` to use `isCellDrawable()`
2. Update shape drawing to use `constrainCellsToSelection()`
3. Update `fillArea()` in canvas store
4. **Test**: Verify drawing is properly constrained

### Step 4: Remove Tool-Switch Clearing
1. Remove selection clearing from `setActiveTool()`
2. Add Cmd+D and Escape handlers
3. Update click-outside logic
4. **Test**: Verify selections persist correctly

### Step 5: Update Effects System
1. Add selection mask parameter to effect processing
2. Update effects store to pass selection
3. **Test**: Verify effects respect selection bounds

### Step 6: Visual Polish
1. Implement 50% opacity for non-selection tools
2. Add status bar indicators for modifier modes
3. **Test**: Verify visual feedback is correct

### Step 7: Deprecation Cleanup
1. Remove redundant selection state from tool store
2. Update all components to use global selection store
3. **Test**: Full regression testing

---

## ✅ Testing Checklist

### Selection Persistence
- [ ] Create rect selection, switch to pencil → selection persists
- [ ] Create lasso selection, switch to eraser → selection persists
- [ ] Create wand selection, switch to paint bucket → selection persists
- [ ] Press Escape → selection clears
- [ ] Press Cmd/Ctrl+D → selection clears
- [ ] Click outside selection with selection tool active → selection clears
- [ ] Click outside selection with drawing tool active → selection persists (no action)

### Drawing Constraints
- [ ] Pencil draws only within selection bounds
- [ ] Eraser erases only within selection bounds
- [ ] Paint bucket fills only within selection bounds
- [ ] Rectangle draws only within selection bounds
- [ ] Ellipse draws only within selection bounds
- [ ] Gradient fills only within selection bounds
- [ ] Clicking outside selection with drawing tool → silently ignored

### Effects Constraints
- [ ] Apply Levels effect with selection → only selected cells affected
- [ ] Apply Hue/Saturation with selection → only selected cells affected
- [ ] Apply to Timeline with selection → same cells affected on all frames
- [ ] Apply effect without selection → entire canvas affected

### Cross-Tool Selection
- [ ] Rect selection + Shift + lasso → cells added to selection
- [ ] Lasso selection + Alt + wand → matching cells removed from selection
- [ ] Wand selection + Shift + rect → cells added to selection
- [ ] New selection without modifier → replaces previous selection

### Move/Copy/Paste
- [ ] Arrow keys move content with any tool active
- [ ] Cmd+C copies selection with any tool active
- [ ] Cmd+V pastes with any tool active
- [ ] Click-drag move only works with selection tool active

### Frame Change Handling
- [ ] Change frame with active selection (no move) → selection persists on new frame
- [ ] Change frame with move in progress → move commits to current frame, selection persists
- [ ] Change frame via timeline click → same behavior as above
- [ ] Change frame via keyboard shortcut → same behavior as above
- [ ] Undo after frame change with committed move → move is undone on previous frame
- [ ] Start playback with active selection → selection cleared, any pending move committed

### Visual Feedback
- [ ] Marching ants at 100% opacity with selection tool active
- [ ] Marching ants at 50% opacity with drawing tool active
- [ ] Status bar shows "Add to Selection" when Shift held
- [ ] Status bar shows "Subtract from Selection" when Alt held

---

## ⚠️ Risk Assessment

### High Risk Areas
1. **Undo/Redo Integration**: Selection changes may need to be tracked in history
2. **Frame Synchronization**: Move operations must commit correctly before frame switch
3. **Performance**: Checking selection constraint on every cell operation could impact large brushes
4. **Auto-Save Race Conditions**: Frame change with pending move must commit before auto-save triggers

### Mitigation Strategies
1. **Undo/Redo**: Create `SelectionHistoryAction` type if needed
2. **Frame Sync**: Hook into frame change event BEFORE canvas data switches; commit move synchronously
3. **Performance**: Use Set.has() for O(1) lookups, cache bounds for quick rejection
4. **Auto-Save**: Use the existing `isDraggingFrame` pattern to prevent auto-save during move commit

---

## 📊 Estimated Effort

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Unified Selection State | 4-6 hours |
| 2 | Tool Switching Changes | 2-3 hours |
| 3 | Selection-Constrained Drawing | 4-6 hours |
| 4 | Selection-Constrained Effects | 3-4 hours |
| 5 | Cross-Tool Selection | 3-4 hours |
| 6 | Visual Updates | 2-3 hours |
| 7 | Keyboard Shortcuts | 1-2 hours |
| 8 | Frame Change Handling | 2-3 hours |
| - | Testing & Bug Fixes | 4-6 hours |
| **Total** | | **25-37 hours** |

---

## 🚀 Implementation Order

**Recommended order for incremental development:**

1. **Phase 1** - Create selection store (foundation)
2. **Phase 2** - Remove tool-switch clearing (unlock persistence)
3. **Phase 6** - Visual updates (user can see persistence)
4. **Phase 7** - Keyboard shortcuts (deselect mechanism)
5. **Phase 8** - Frame change handling (animation workflow)
6. **Phase 3** - Constrained drawing (core feature)
7. **Phase 4** - Constrained effects (extended feature)
8. **Phase 5** - Cross-tool selection (advanced feature)

This order allows for testing at each stage and ensures users always have a way to deselect before drawing constraints are applied. Frame change handling (Phase 8) is placed early to ensure animation workflows work correctly before adding drawing constraints.

---

## 📝 Documentation Updates Required

After implementation:
- [ ] Update `COPILOT_INSTRUCTIONS.md` with new selection architecture
- [ ] Update `DEVELOPMENT.md` with new phase completion
- [ ] Create user-facing documentation for new selection behavior
- [ ] Update keyboard shortcuts documentation

---

*Document created: January 24, 2026*
*Status: Pending Approval*
