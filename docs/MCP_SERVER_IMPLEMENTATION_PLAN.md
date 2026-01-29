# Plan: MCP Server for Ascii-Motion

Build a standalone, stdio-based MCP server (`ascii-motion-mcp`) enabling LLM-powered tools to create, animate, import, and export ASCII art. Users can paste found art, import images/videos with full conversion control, animate via prompts, and export to any format. Token-efficient previews, animation workflows, full undo integration, rich tool discoverability, and future layer support.

---

## Project Context

### What is Ascii-Motion?
A web-based ASCII/ANSI art editor with animation capabilities. Users can draw with characters, import images/videos and convert them to ASCII, apply effects/generators, and export to multiple formats.

### Tech Stack
| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool |
| Zustand 5 | State management |
| Tailwind CSS | Styling |
| Shadcn/ui + Radix | UI components |
| Supabase | Cloud storage, auth (premium) |
| FFmpeg/WebCodecs | Video export |

### Repository Structure
```
Ascii-Motion/
├── src/                      # Main application source
│   ├── components/           # React components
│   ├── stores/               # Zustand stores (canvasStore, animationStore, etc.)
│   ├── types/                # TypeScript types (Cell, Frame, SessionData)
│   ├── utils/                # Utilities (asciiConverter, exportRenderer, etc.)
│   └── constants/            # Character palettes, fonts, etc.
├── packages/
│   ├── core/                 # Shared UI components (MIT)
│   ├── premium/              # Auth, cloud, Stripe (PRIVATE - never expose)
│   └── web/
│       ├── docs-site/        # Documentation site
│       └── marketing/        # Marketing site
├── docs/                     # Development documentation
└── dev-tools/                # Testing utilities
```

### Key Source Files to Reference

**Types (copy/adapt for MCP):**
- `src/types/index.ts` — `Cell`, `Canvas`, `Frame`, `FrameId`
- `src/types/session.ts` — `SessionData`, `SessionFrame` (`.asciimtn` format)
- `src/types/export.ts` — All export settings interfaces
- `src/types/palette.ts` — `CharacterPalette`, `CharacterMappingSettings`

**Stores (understand the API surface):**
- `src/stores/canvasStore.ts` — `setCell`, `getCell`, `clearCell`, `setCells`, `resize`
- `src/stores/animationStore.ts` — `addFrame`, `deleteFrame`, `goToFrame`, `setFrameDuration`
- `src/stores/toolStore.ts` — Colors, active tool, clipboard
- `src/stores/historyStore.ts` — Undo/redo system
- `src/stores/importStore.ts` — `ImportSettings` interface
- `src/stores/exportStore.ts` — Export settings and state

**Utilities (logic to mirror):**
- `src/utils/asciiConverter.ts` — `ConversionSettings`, image-to-ASCII logic
- `src/utils/effects/` — Effect processing functions
- `src/utils/generators/` — Procedural animation generators
- `src/utils/exportRenderer.ts` — Export logic
- `src/utils/session/sessionImporter.ts` — `.asciimtn` file loading
- `src/utils/session/exportDataCollector.ts` — Gathering project state

**Constants:**
- `src/constants/defaultCharacterPalettes.ts` — Built-in character sets
- `src/constants/defaultColorPalettes.ts` — Built-in color palettes

### Data Structures

**Cell** (single canvas character):
```typescript
interface Cell {
  char: string;    // Single character
  color: string;   // Foreground hex color
  bgColor: string; // Background hex color
}
```

**Canvas cells** use `Map<string, Cell>` with keys as `"x,y"` format.

**Frame**:
```typescript
interface Frame {
  id: FrameId;
  name: string;
  duration: number;   // milliseconds
  data: Map<string, Cell>;
  thumbnail?: string;
}
```

**SessionData** (`.asciimtn` file format):
```typescript
interface SessionData {
  version: string;
  name?: string;
  description?: string;
  canvas: { width, height, canvasBackgroundColor, showGrid };
  animation: { frames: SessionFrame[], currentFrameIndex, frameRate, looping };
  tools: SessionToolState;
  typography?: TypographySettings;
  palettes?: PaletteState;
  characterPalettes?: CharacterPaletteState;
}
```

---

## Getting Started (For Fresh Sessions)

### Prerequisites
1. Familiarity with MCP protocol (`@modelcontextprotocol/sdk`)
2. Node.js 18+, TypeScript
3. Access to create new GitHub repository for `ascii-motion-mcp`

### First Steps

1. **Create the new repository**
   ```bash
   # Outside the Ascii-Motion repo
   mkdir ascii-motion-mcp && cd ascii-motion-mcp
   npm init -y
   npm install @modelcontextprotocol/sdk zod typescript
   npm install -D @types/node vitest
   ```

2. **Set up TypeScript**
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "outDir": "dist",
       "rootDir": "src",
       "strict": true,
       "declaration": true
     },
     "include": ["src"]
   }
   ```

3. **Configure package.json**
   ```json
   {
     "name": "ascii-motion-mcp",
     "version": "0.1.0-alpha.1",
     "type": "module",
     "bin": {
       "ascii-motion-mcp": "./dist/index.js"
     },
     "files": ["dist"],
     "scripts": {
       "build": "tsc",
       "dev": "tsc --watch",
       "test": "vitest"
     }
   }
   ```

4. **Copy types from Ascii-Motion**
   - Read `src/types/index.ts`, `src/types/session.ts`, `src/types/export.ts`
   - Create equivalent types in MCP package with Zod schemas

5. **Implement first tool (`new_project`)**
   - Start with the simplest tool to verify MCP setup works
   - Test with `npx @modelcontextprotocol/inspector`

### Development Workflow

```bash
# Terminal 1: Watch MCP package
cd ascii-motion-mcp
npm run dev

# Terminal 2: Test with MCP inspector
npx @modelcontextprotocol/inspector ./dist/index.js

# Terminal 3: Run Ascii-Motion for Phase 3 testing
cd Ascii-Motion
npm run dev
```

### Validation Checkpoints

Before moving to next phase:
- [ ] All tools in phase have unit tests
- [ ] Tools work with MCP inspector
- [ ] Security checklist items verified
- [ ] Documentation drafted for new tools

---

## Implementation Steps

### 1. Scaffold `ascii-motion-mcp` package
New standalone npm repo with TypeScript, `@modelcontextprotocol/sdk`, Zod. `bin` entry for `npx ascii-motion-mcp`, `--project-dir` for sandboxed file access, `--port` for WebSocket. All tool schemas include optional `layer` param. Rich `description` and `examples` on every tool for LLM self-discovery.

### 2. Implement types and validation
Inline `Cell`, `Frame`, `SessionData`, `ConversionSettings`, `ImportSettings`, export settings from `src/types/`, `src/stores/importStore.ts`, `src/utils/asciiConverter.ts`. Zod schemas for all inputs.

### 3. Implement Phase 1a: Core canvas/frame tools
- **Canvas**: `set_cell`, `get_cell`, `clear_cell`, `set_cells_batch`, `paste_ascii_block`, `fill_region`, `resize_canvas`
- **Frames**: `add_frame`, `delete_frame`, `duplicate_frame`, `go_to_frame`, `list_frames`, `set_frame_duration`
- **Project**: `load_project`, `save_project`, `new_project`, `create_from_template` (presets: terminal-80x24, wide-120x30, square-40x40, etc.)
- **History**: `undo`, `redo`

### 4. Implement Phase 1b: Token-efficient previews
- `get_canvas_summary` — dimensions, fill count, bounding box (~30 tokens)
- `get_canvas_preview` — sparse non-empty cells, optional region filter
- `get_canvas_ascii` — raw text grid with optional `overlay_previous_frame` for motion context
- `get_frame_diff` — sparse diff between two frames
- `describe_animation` — frame count, timing, motion pattern summary

Document that LLMs should use summary first, detailed previews only for user verification.

### 5. Implement Phase 1c: Animation workflows
- `copy_frame_and_modify` — duplicate current frame + apply sparse edits in one call
- `shift_frame_content` — translate all cells by x/y offset
- `flip_region` — horizontal/vertical mirror
- `copy_region_to_frame` — copy selection from one frame to another
- `interpolate_frames` — auto-generate intermediate frames between keyframes

### 6. Implement Phase 1d: Selection tools
- `select_rectangle` — rectangular selection
- `select_by_color` — magic wand selection
- `get_selection` — get current selection bounds/mask
- `clear_selection` — deselect
- `apply_to_selection` — run operation on selected region only

### 7. Implement Phase 1e: Palette and color tools
**Characters:**
- `list_character_palettes`
- `get_palette_characters`
- `set_active_palette`

**Colors:**
- `get_color_palette`
- `list_color_palettes`
- `set_foreground_color`
- `set_background_color`
- `get_active_colors`

### 8. Implement Phase 2a: Import tools
**`import_image`** with full `ImportSettings`:
- `characterWidth`, `characterHeight`, `maintainAspectRatio`
- `nudgeX`, `nudgeY`
- `enableCharacterMapping`, `characterPalette`, `characterMappingMode` (brightness/edge/by-index/dithering)
- `enableTextColorMapping`, `textColorPalette`
- `enableBgColorMapping`, `bgColorPalette`
- brightness/contrast/highlights/shadows/blur/sharpen adjustments
- `enableColorAsAlpha`, `colorAsAlphaKey`, `colorAsAlphaTolerance`
- Optional `preview: true` returns ASCII text without applying (for user verification flows)

**`import_video_as_animation`** — convenience wrapper that imports video and auto-distributes frames to timeline with configurable `frameInterval` and `maxFrames`

### 9. Implement Phase 2b: Effects and generators
**Effects** (`apply_effect`):
- levels
- hue-saturation
- remap-colors
- remap-characters
- scatter

**Generators** (`run_generator`):
- radio-waves
- turbulent-noise
- particle-physics
- rain-drops
- digital-rain

All operations push to undo history.

### 10. Implement Phase 2c: Export tools
- `export_image` — PNG/JPG/SVG with sizeMultiplier, includeGrid, quality, svgSettings
- `export_video` — MP4/WebM with frameRate, frameRange, quality, crf, loops
- `export_html` — self-contained animation
- `export_text` — plain .txt
- `export_json` — structured data
- `export_react` — JSX/TSX component
- `export_session` — .asciimtn project file
- `export_ink` — Ink CLI component
- `export_opentui` — OpenTUI component
- `export_bubbletea` — Bubbletea component

Write to `--project-dir`, return file path. Optional `returnData: true` for base64 (small outputs only).

### 11. Implement Phase 3: Live browser sync
- `--live` mode starts WebSocket server on `127.0.0.1`
- One-time auth token printed to stdout
- Client module in `src/` connects, validates token, relays commands to Zustand stores (`canvasStore`, `animationStore`, `historyStore`)
- Connection status indicator in app UI
- MCP resources: `project://state`, `project://frames`, `project://canvas` for subscription without polling

### 12. Implement MCP prompts resource
Expose `prompts://` with pre-built templates:
- "Animate a walking character"
- "Add parallax background"
- "Create typing effect"
- "Generate rain animation"
- "Import and animate photo"
- "Create looping animation"

Include customizable parameters so users can invoke directly from MCP clients.

### 13. Security hardening
- Sandbox file operations to `--project-dir`
- Zod validation on all inputs
- WebSocket binds localhost-only with token + origin validation
- Timeouts for long-running operations (video export, large imports)
- Rate limiting for batch operations

### 14. Write documentation
Add to `packages/web/docs-site/`:
- Installation guide
- MCP client setup (Copilot, Claude Desktop, Cursor)
- Workflow tutorials:
  - "Paste and animate found ASCII art"
  - "Import photo and animate"
  - "Generate rain effect"
  - "Export to video via prompt"
- Full tool reference with examples
- Prompt templates guide
- Import settings reference
- Security notes
- Troubleshooting

---

## Summary

| Phase | Scope | Tools |
|-------|-------|-------|
| **1** | Core editing | 25+ tools for canvas, frames, previews, animation, selection, palettes, colors |
| **2** | Import/Effects/Export | ~15 tools for media import, effects, generators, all export formats |
| **3** | Live sync | WebSocket bridge, MCP resources, browser client module |

---

## Development & Deployment Strategy

### Repository Structure

The MCP server will be a **separate public npm package** (`ascii-motion-mcp`) to allow easy installation via `npx`. However, care must be taken about what is exposed publicly.

| Component | Location | Visibility | Rationale |
|-----------|----------|------------|-----------|
| MCP server package | New repo: `ascii-motion-mcp` | **Public** | Users need to install via npm |
| Shared types (Cell, Frame, SessionData) | Inline in MCP package | **Public** | Required for MCP to function; mirrors public `.asciimtn` format |
| Browser sync client module | `src/mcp/` in main repo | **Private** (in Ascii-Motion repo) | Part of main app, not separately distributed |
| WebSocket auth token logic | MCP server | **Public** | Token is generated locally per session; no secrets in code |
| Import/export utilities | Reimplemented in MCP or imported | **Public** | Core functionality, no proprietary algorithms |
| Premium features (cloud save, auth, Stripe) | `packages/premium/` | **Private** | Never exposed via MCP |

### Security Review Checklist

Before any public release, verify:

- [ ] No Supabase keys, URLs, or auth logic in MCP package
- [ ] No Stripe integration or payment logic exposed
- [ ] No cloud storage endpoints or user data handling
- [ ] No references to premium package internals
- [ ] WebSocket auth uses ephemeral per-session tokens only
- [ ] File operations sandboxed to `--project-dir`
- [ ] No eval() or dynamic code execution from MCP inputs
- [ ] All user inputs validated via Zod schemas

### Git Branching Strategy

```
main (protected)
  └── feat/mcp-phase-1
        ├── feat/mcp-core-tools
        ├── feat/mcp-preview-tools
        ├── feat/mcp-animation-tools
        └── feat/mcp-selection-tools
  └── feat/mcp-phase-2
        ├── feat/mcp-import-tools
        ├── feat/mcp-effects-tools
        └── feat/mcp-export-tools
  └── feat/mcp-phase-3
        ├── feat/mcp-websocket
        └── feat/mcp-browser-client
```

**Rules:**
- Feature branches off `main`, PR required for merge
- Squash merges to keep history clean
- Phase branches aggregate related features before merging to `main`
- No direct commits to `main`

### Testing Strategy

| Layer | Scope | Tools |
|-------|-------|-------|
| **Unit** | Individual MCP tools (set_cell, add_frame, etc.) | Vitest, mock file system |
| **Integration** | File I/O, project load/save round-trips | Vitest, temp directories |
| **E2E (Phase 3)** | WebSocket handshake, browser sync | Playwright + test server |
| **Security** | Path traversal attempts, malformed inputs | Fuzzing with Zod edge cases |

Minimum coverage target: **80%** for core tools before public release.

### CI/CD Pipeline

**MCP Package (`ascii-motion-mcp` repo):**

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    - Lint (ESLint, Prettier)
    - Type check (tsc --noEmit)
    - Unit + integration tests
    - Security audit (npm audit)
  
  publish:
    on: tag v*
    - Build
    - Publish to npm with appropriate dist-tag
```

**Main Ascii-Motion repo:**

```yaml
# .github/workflows/ci.yml (additions for Phase 3)
jobs:
  test-mcp-client:
    - Test browser sync client module
    - E2E WebSocket tests
```

### Versioning & Release Strategy

| Stage | npm dist-tag | Version | Audience |
|-------|--------------|---------|----------|
| Development | `@dev` | `0.x.x-dev.N` | Internal testing only |
| Alpha | `@alpha` | `0.x.x-alpha.N` | Early adopters, expect breaking changes |
| Beta | `@beta` | `0.x.x-beta.N` | Wider testing, API stabilizing |
| Stable | `@latest` | `1.0.0+` | General availability |

**Changelog:** Maintain `CHANGELOG.md` with Keep a Changelog format. Document breaking changes prominently.

**Deprecation policy:** Minimum 1 minor version warning before removing/changing tools.

### Staged Rollout Plan

| Phase | Release | Milestone |
|-------|---------|-----------|
| **1** | `0.1.0-alpha.1` | Core tools working, file-based only |
| **1 complete** | `0.1.0-beta.1` | All Phase 1 tools, docs for core features |
| **2** | `0.2.0-alpha.1` | Import/effects/export tools |
| **2 complete** | `0.2.0-beta.1` | Full Phase 2, comprehensive docs |
| **3** | `0.3.0-alpha.1` | WebSocket sync working |
| **3 complete** | `1.0.0` | Full feature set, stable API, complete docs |

### Documentation Deployment

- Docs live in `packages/web/docs-site/`
- MCP docs added under `/mcp/` route
- Deployed via existing Vercel pipeline
- Docs PRs require review before merge
- No documentation of internal/premium features in MCP docs

### What NOT to Expose via MCP

The following must **never** be accessible through MCP tools:

| Category | Examples | Reason |
|----------|----------|--------|
| Authentication | Supabase auth, session tokens | Security risk |
| Cloud storage | Project save/load to Supabase | Requires auth, premium feature |
| Payments | Stripe integration, subscription status | Security, business logic |
| User data | Email, profile, usage analytics | Privacy |
| Premium features | Anything in `packages/premium/` | Business model |
| Internal APIs | Admin endpoints, feature flags | Security |

The MCP operates exclusively on **local files** and **local browser instances**. All cloud features remain manual user actions through the web UI.
