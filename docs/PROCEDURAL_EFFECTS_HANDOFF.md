# Procedural Effects System — Session Handoff

## Branch Status
- **Branch:** `feature/procedural-effects` (all work merged here)
- **Base:** `main`
- **PR to main:** Not yet created (on hold per user request)
- **Tests:** 379 pass (343 original + 36 new)
- **Build:** Green
- **Lint:** Clean (only pre-existing issues in MediaImportPanel, useCanvasMouseHandlers, mcp/client)

## Completed Phases (Original Plan)

### Phase 1: Type System ✅
- `src/types/effectBlock.ts` — EffectBlockId, EffectTrackId, EffectPropertyTrackId, EffectBlock, EffectTrack, EffectPropertyTrack, EffectKeyframe, EffectPropertyDefinition, session serialization types
- `src/types/timeline.ts` — Extended Layer & LayerGroup with `effectTracks: EffectTrack[]`, extended TimelineViewState with `selectedEffectBlockId`, `expandedEffectTrackIds`, `editingEffectKeyframeId`, `globalEffectsExpanded`

### Phase 2: Registry & Pipeline ✅
- `src/registry/effectRegistry.ts` — Plugin registry (registerEffect, getEffect, getAllEffects)
- `src/registry/effects/` — 7 effect entries (levels, hueSaturation, remapColors, remapCharacters, scatter, waveWarp, wiggle)
- `src/utils/effectKeyframeInterpolation.ts` — Numeric + hold interpolation
- `src/utils/effectsPipeline.ts` — evaluateEffectBlock, applyEffectsToLayer/Group/Global, bakeEffectIntoFrames, hasActiveEffectsAtFrame
- All processors made synchronous (removed async/await)

### Phase 3: Store Integration ✅
- 15+ store actions: addEffectBlock, removeEffectBlock, updateEffectBlockTiming/Settings, reorderEffectTracks, toggleEffectBlockEnabled, addEffectPropertyTrack, addEffectKeyframe/removeEffectKeyframe/updateEffectKeyframe, selectEffectBlock, toggleEffectTrackExpanded, setEditingEffectKeyframe, toggleGlobalEffectsExpanded, moveEffectTrack, bakeEffect
- globalEffects changed from EffectInstance[] to EffectTrack[]
- Store actions for keyframe operations (addKeyframe, removeKeyframe, updateKeyframe, copyKeyframes, pasteKeyframes) extended to fall through to effect property tracks

### Phase 4: Compositing Pipeline ✅
- Per-layer effects applied in local space before transforms
- Group effects applied to each child layer before group transforms
- Global effects applied after full compositing
- useCompositedCanvas passes globalEffects through

### Phase 5: Timeline UI ✅
- `EffectBlock.tsx` — Draggable/resizable block bars with category colors, undo history
- `EffectTrackRow.tsx` — Left panel row with eye toggle, drag handle, expand, delete, drag-and-drop reorder/move
- `GlobalEffectsTrackHeader.tsx` — Top of timeline, subscribes directly to store, collapse/expand synced with track area
- LayerListItem, GroupHeader, TimelineTrackArea — All extended with effect rendering

### Phase 6: Properties Panel ✅
- `EffectPropertiesPanel.tsx` — Right sidebar with per-property value inputs, keyframe diamond buttons, auto-key, MappingEditor for remap effects, Apply/Delete buttons
- Inline color/character mapping editors with canvas auto-detection
- Palette-based remapping mode for colors
- Panel switching: selecting effect block clears editing keyframe, selecting layer clears effect selection

### Phase 7: Session Serialization ✅
- getSessionData() serializes effectTracks for layers, groups (with null-safe guards)
- sessionImporter.ts deserializes effectTracks (falls back to [])

### Phase 8: Testing ✅
- effectRegistry.test.ts (11 tests)
- effectsPipeline.test.ts (13 tests)  
- effectBlocks.test.ts (12 tests)

## Additional Features Beyond Original Plan

### Bake/Apply Effect ✅
- "Apply" button in effect properties panel footer
- `bakeEffectIntoFrames()` — Splits content frames at effect boundaries, per-frame evaluation for keyframed effects
- `bakeEffect()` store action — Handles layer/group/global targets, flushes canvas, syncs after bake
- Full undo: snapshots all affected layers' content frames (deep clone), restores wholesale on undo

### Drag-and-Drop Effect Reorder/Move ✅
- Drag handle on each EffectTrackRow
- Reorder within same owner (layer/group/global)
- Cross-owner drag: layer↔layer, layer↔global, layer↔group, group↔global
- Drop zones: LayerListItem, GroupHeader, GlobalEffectsTrackHeader all accept effect drops
- Visual: "onto" ring highlight for layers/groups/global, "between" border for reorder
- stopPropagation prevents conflict with layer drag-and-drop

### Comprehensive Undo/Redo ✅
- `useEffectBlockHistory.ts` hook — recordAdd, recordRemove, recordUpdate helpers
- 8 undo handler cases in useKeyboardShortcuts.ts
- All undo handlers restore full track snapshots (including keyframes/property tracks) via direct setState, not addEffectBlock
- Bake undo restores deep-cloned content frames + full effect track

### Figma-Style Drag-to-Scrub ✅
- `useScrubInput.ts` hook — Drag on property labels to scrub values
- Applied to LayerPropertiesPanel, EffectPropertiesPanel, KeyframeEditorPanel, GroupPropertiesPanel

### Full Keyframe Feature Parity ✅
- Effect keyframes use KeyframeDiamond component (drag, alt-dup, multi-select, context menu)
- Collapsed keyframe dots on all effect tracks and global effects header
- U hotkey expands/collapses effect tracks + global effects
- J/K keyframe navigation includes effect keyframes
- Copy/paste keyframes works across effect property tracks
- Marquee selection includes effect keyframe rows
- KeyframeEditorPanel searches effect tracks + global effects
- Auto-expand layer + effect track when adding keyframes
- Auto-key: changing value on keyframed property auto-creates keyframe at playhead

### registerAllEffects() called in main.tsx at startup

## Known Issues / Remaining Work

### Not Yet Implemented
1. **Old effects system cleanup** — effectsStore.ts and timeEffectsStore.ts still exist. The old destructive effects panel (EffectsPanel.tsx) still exists. EffectsSection.tsx was updated to use new system, but old floating panel and time effects dialogs remain. Should be removed in a cleanup pass.
2. **Session format version bump** — Currently still "2.0.0", should bump to "2.1.0" for the effectTracks additions
3. **Export paths** — Verify all export formats (React, CLI, Video) correctly evaluate procedural effects during export. The compositing pipeline inject should handle this but hasn't been manually verified for all formats.
4. **MCP server** — Needs effect block CRUD tools added (separate repo)
5. **Performance optimization** — Effect evaluation memoization, lazy evaluation for non-visible layers during interactive editing

### Potential Issues to Watch
- The `structuredClone` used for track snapshots — ensure it handles all nested structures correctly (Maps, custom types)
- The old effectsStore is still imported by the old EffectsPanel.tsx and some test files — removing it requires updating those consumers
- Canvas analysis utility (analyzeCanvas from old effectsStore) is still used by the MappingEditor — if effectsStore is removed, extract as standalone
- Frame synchronization during bake — the auto-save subscription may write stale data; the flush-before-bake pattern addresses this

## Files Changed (summary)

### New files (created in this feature):
- src/types/effectBlock.ts
- src/registry/effectRegistry.ts
- src/registry/effects/ (7 files + index.ts)
- src/utils/effectKeyframeInterpolation.ts
- src/utils/effectsPipeline.ts
- src/components/features/timeline/EffectBlock.tsx
- src/components/features/timeline/EffectTrackRow.tsx
- src/components/features/timeline/GlobalEffectsTrackHeader.tsx
- src/components/features/timeline/EffectPropertiesPanel.tsx
- src/hooks/useScrubInput.ts
- src/hooks/useEffectBlockHistory.ts
- src/__tests__/effectRegistry.test.ts
- src/__tests__/effectsPipeline.test.ts
- src/__tests__/effectBlocks.test.ts

### Modified files:
- src/types/timeline.ts — Layer, LayerGroup, TimelineViewState, session types
- src/types/index.ts — 8 new HistoryActionType + interfaces
- src/stores/timelineStore.ts — Major: globalEffects type, 15+ actions, bakeEffect
- src/utils/layerCompositing.ts — Effect pipeline injection
- src/utils/effectsProcessing.ts — Made processors sync + exported
- src/hooks/useCompositedCanvas.ts — Global effects pass-through
- src/hooks/useKeyboardShortcuts.ts — 8 undo cases, U hotkey, J/K navigation
- src/components/features/TimelinePanel.tsx — EffectPropertiesPanel wiring
- src/components/features/EffectsSection.tsx — Uses new registry
- src/components/features/timeline/TimelineTrackArea.tsx — Major: effect rows, keyframes, dots, marquee
- src/components/features/timeline/LayerListItem.tsx — Effect tracks, add effect, drop target
- src/components/features/timeline/GroupHeader.tsx — Effect tracks, add effect, drop target
- src/components/features/timeline/LayerList.tsx — GlobalEffectsTrackHeader
- src/components/features/timeline/KeyframeDiamond.tsx — Effect track search
- src/components/features/timeline/KeyframeEditorPanel.tsx — Effect + global search
- src/components/features/timeline/TimelineContextMenu.tsx — Paste for effect tracks
- src/components/features/timeline/LayerPropertiesPanel.tsx — Scrub input
- src/components/features/timeline/GroupPropertiesPanel.tsx — Scrub input
- src/utils/sessionImporter.ts — Deserialize effectTracks
- src/main.tsx — registerAllEffects()
