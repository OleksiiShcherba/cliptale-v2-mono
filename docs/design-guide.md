# Design Guide — ClipTale

> Rewritten 2026-04-14 during **EPIC 10 STAGE 1 — Design Tooling Migration (Figma → Google Stitch)**.
> Source of truth migrated from Figma to Google Stitch; this file now points every design-touching agent at the Stitch MCP server.
> Intended for AI development agents to reference during implementation.

---

## 1. Stitch Project

| Property | Value |
|----------|-------|
| **MCP server** | `stitch` (via `@_davideast/stitch-mcp` wrapping `@google/stitch-sdk` `StitchProxy`) |
| **Project resource name** | `projects/1905176480942766690` |
| **Project ID** | `1905176480942766690` |
| **Project title** | `ClipTale` |
| **Origin** | `STITCH` |
| **Type** | `PROJECT_DESIGN` |
| **Visibility** | `PRIVATE` |
| **Created** | 2026-04-14 (EPIC 10 STAGE 1 subtask 5) |

Previous source of truth (deprecated): Figma file `KwzjofZgWKvEQuz9bXzEYT`. The `figma-remote-mcp` server was removed from this project's config in subtask 6 — all `mcp__figma-remote-mcp__*` tool references are now dead.

---

## 2. Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Mobile | 390px | Default / mobile-first base |
| Tablet | 768px | `@media (min-width: 768px)` |
| Desktop | 1440px | `@media (min-width: 1440px)` |

---

## 3. Design System

### Colors (Dark Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#7C3AED` | Brand, CTAs, active states, export button |
| `primary-dark` | `#5B21B6` | Hover states on primary elements |
| `primary-light` | `#4C1D95` | Tinted backgrounds, active sidebar items |
| `surface` | `#0D0D14` | Page background, editor canvas |
| `surface-alt` | `#16161F` | Sidebars, nav bars, panels |
| `surface-elevated` | `#1E1E2E` | Cards, modals, inspector panels |
| `text-primary` | `#F0F0FA` | Body text, headings, labels |
| `text-secondary` | `#8A8AA0` | Captions, placeholders, metadata |
| `border` | `#252535` | Dividers, outlines, separators |
| `success` | `#10B981` | Asset ready status, confirmations |
| `warning` | `#F59E0B` | Overlay track clips, alerts |
| `error` | `#EF4444` | Errors, destructive actions |
| `info` | `#0EA5E9` | Image clip blocks on the timeline |

### Stitch Design System Asset

The ClipTale design system is registered with Stitch as a single asset, applied to the ClipTale project:

| Property | Value |
|----------|-------|
| **Resource name** | `assets/17601109738921479972` |
| **Version** | `1` |
| **Display name** | `ClipTale Dark` |
| **Applied to** | `projects/1905176480942766690` |

Echoed theme fields (confirmed round-trip via `mcp__stitch__list_design_systems`):

| Field | Value |
|-------|-------|
| `colorMode` | `DARK` |
| `colorVariant` | `VIBRANT` |
| `customColor` | `#7C3AED` |
| `overridePrimaryColor` | `#7C3AED` |
| `roundness` | `ROUND_EIGHT` (8px, mirrors `radius-md`) |
| `headlineFont` / `bodyFont` / `labelFont` | `INTER` |
| `designMd` | Full token-reference markdown (inlined at create time) |

**Important — Stitch does NOT expose per-token variable IDs** the way Figma did. The authoritative token values live in the tables in this section (§3). The Stitch asset mirrors them through the echoed top-level fields above and through the inlined `designMd` blob. Treat §3 of this file as authoritative — do not rely on the Stitch echo alone for spacing/typography (see §10 OQ-S4).

### Typography

Font family: **Inter**

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `display` | 32px | 700 Bold | 40px | Hero headings |
| `heading-1` | 24px | 700 Bold | 32px | Page titles |
| `heading-2` | 20px | 600 Semi Bold | 28px | Section titles, panel headers |
| `heading-3` | 16px | 600 Semi Bold | 24px | Card titles, sidebar section labels |
| `body` | 14px | 400 Regular | 20px | Body text |
| `body-sm` | 12px | 400 Regular | 16px | Secondary body, timestamps |
| `label` | 12px | 500 Medium | 16px | Form labels, block labels (UPPERCASE) |
| `caption` | 11px | 400 Regular | 16px | Metadata, timecodes, status badges |

### Spacing

Base unit: **4px**

| Token | Value | CSS |
|-------|-------|-----|
| `space-1` | 4px | `var(--space-1)` |
| `space-2` | 8px | `var(--space-2)` |
| `space-3` | 12px | `var(--space-3)` |
| `space-4` | 16px | `var(--space-4)` |
| `space-6` | 24px | `var(--space-6)` |
| `space-8` | 32px | `var(--space-8)` |
| `space-12` | 48px | `var(--space-12)` |
| `space-16` | 64px | `var(--space-16)` |

### Border Radius

| Token | Value |
|-------|-------|
| `radius-sm` | 4px |
| `radius-md` | 8px |
| `radius-lg` | 16px |
| `radius-full` | 9999px |

---

## 4. Component Naming Conventions

Pattern: `ComponentName/Variant/State`

Examples:
- `Button/Primary/Default`, `Button/Primary/Hover`, `Button/Secondary/Disabled`
- `Input/Default/Focused`, `Input/Default/Error`
- `Card/Project/Default`, `Card/Project/Hover`
- `AssetItem/Video/Ready`, `AssetItem/Video/Processing`
- `TrackClip/Video`, `TrackClip/Audio`, `TrackClip/Caption`, `TrackClip/Overlay`

Block shapes from the Design System page follow: `Block/Type` (e.g. `Block/Primary`, `Block/Nav`, `Block/Action`).

---

## 5. Stitch Project Structure

Unlike Figma, Stitch organizes a project as a **flat list of screens** — there is no "page" concept. Each screen has:

| Field | Description |
|-------|-------------|
| `name` | Stable resource name: `projects/<project_id>/screens/<screen_id>` |
| `deviceType` | `DESKTOP` / `TABLET` / `MOBILE` |
| `width` × `height` | Render dimensions (Stitch renders at ~2× logical resolution) |
| `title` | Human-readable label |
| `screenshot.downloadUrl` | Ephemeral Google CDN URL — **do NOT persist** |
| `htmlCode.downloadUrl` | Ephemeral HTML export — **do NOT persist** |

**Logical design target** remains **1440×900** for the editor and the breakpoints in §2 for everything else. Stitch's rendered artboards come out at ~2× scale (e.g. 2880×2048 for the editor) which is a render convention, not a redefinition of the design target.

The ClipTale project currently contains 5 DESKTOP screens (see §6). Tablet and mobile variants for Marketing / Dashboard / Editor are planned but not yet generated — see §10 OQ-S2.

---

## 6. Stitch Screen IDs

All screens live under project `projects/1905176480942766690`. Generated via `PRO_AGENT` (`figaro_agent`) during subtask 5 on 2026-04-14.

| Screen | deviceType | width × height | `screen.id` | Stitch title |
|--------|-----------|----------------|-------------|--------------|
| Landing Page (canonical) | DESKTOP | 2560 × 7958 | `1ee6b7019af146848c614a3862e3c694` | ClipTale Landing Page |
| Landing Page (duplicate ⚠️) | DESKTOP | 2560 × 7482 | `0c21f70dd06c45a4b43ca0aca934e049` | ClipTale Landing Page |
| Dashboard | DESKTOP | 2880 × 2048 | `42945722fe52447f81e5be244f7cbb33` | ClipTale Dashboard |
| Main Editor | DESKTOP | 2880 × 2048 | `d0c1501471194e73b4a3de0ba9ac92e8` | ClipTale Video Editor |
| Asset Browser | DESKTOP | 2560 × 2048 | `3d7bcc0c282a40f0a1a5d933988da383` | Asset Browser |

Full resource names (use these with `mcp__stitch__get_screen`):

- `projects/1905176480942766690/screens/1ee6b7019af146848c614a3862e3c694` — Landing Page (canonical)
- `projects/1905176480942766690/screens/0c21f70dd06c45a4b43ca0aca934e049` — Landing Page (duplicate, see §10 OQ-S1)
- `projects/1905176480942766690/screens/42945722fe52447f81e5be244f7cbb33` — Dashboard
- `projects/1905176480942766690/screens/d0c1501471194e73b4a3de0ba9ac92e8` — Main Editor
- `projects/1905176480942766690/screens/3d7bcc0c282a40f0a1a5d933988da383` — Asset Browser

⚠️ **Two Landing Page screens exist.** During subtask 5 the first `generate_screen_from_text` call returned a network error, a retry was authorized by the user, and the retry succeeded — but a live `list_screens` on 2026-04-14 shows **both** the errored attempt and the retry persisted. Treat `1ee6b7019af146848c614a3862e3c694` (the one subtask 5's log captured as successful) as canonical. See §10 OQ-S1.

---

## 7. How to Query Stitch via MCP

AI agents read design data from Stitch through the **`stitch` MCP server** registered at the user level in `~/.claude.json`. The server is a thin proxy over `@google/stitch-sdk`'s `StitchProxy` (upstream) wrapped by `@_davideast/stitch-mcp` (Claude Code-compatible CLI). Project ID: `1905176480942766690`.

### Available tools (12 — verified 2026-04-14)

**Read-only:**
- `mcp__stitch__list_projects` — list all projects under the auth scope
- `mcp__stitch__get_project { name }` — full project metadata
- `mcp__stitch__list_screens { projectId }` — all screens in a project
- `mcp__stitch__get_screen { name }` — single screen with `screenshot` / `htmlCode` download URLs
- `mcp__stitch__list_design_systems { projectId }` — design-system assets + echoed theme

**Design-system mutation:**
- `mcp__stitch__create_design_system`
- `mcp__stitch__update_design_system`
- `mcp__stitch__apply_design_system`

**Project / screen mutation & generation:**
- `mcp__stitch__create_project { title }`
- `mcp__stitch__generate_screen_from_text { projectId, prompt, deviceType }`
- `mcp__stitch__edit_screens { projectId, screenIds, instructions }`
- `mcp__stitch__generate_variants { projectId, screenId, ... }`

### Get a specific screen

```
mcp__stitch__get_screen { name: "projects/1905176480942766690/screens/d0c1501471194e73b4a3de0ba9ac92e8" }
```

### List all screens in the ClipTale project

```
mcp__stitch__list_screens { projectId: "1905176480942766690" }
```

### Read the applied design system

```
mcp__stitch__list_design_systems { projectId: "1905176480942766690" }
```

### Practical agent pattern

1. Find the screen ID from the table in §6.
2. Call `mcp__stitch__get_screen` with the full `projects/<pid>/screens/<sid>` resource name to fetch the layout data, screenshot URL, and HTML export URL.
3. Cross-reference the token tables in §3 for authoritative color / spacing / typography values — Stitch does not round-trip spacing/typography maps; only the echoed top-level theme fields and `designMd` markdown blob come back.
4. Screenshot and HTML-code download URLs are ephemeral Google CDN links (`lh3.googleusercontent.com/aida/...` and `contribution.usercontent.google.com/...`). Do NOT persist them in code, docs, or commits — re-fetch on demand.

### Authentication

The `stitch` MCP server authenticates via `STITCH_API_KEY` stored in the user-level `~/.claude.json` under `mcpServers.stitch.env`. The key is **not** stored in this repo. Never paste or log it.

### Agent tier

Screens in this project are generated via Stitch's `PRO_AGENT` (`figaro_agent`), which is the default for the project as provisioned during subtask 5.

---

## 8. Epic & Screen Inventory

### Epic: Marketing
| Screen | Breakpoints generated | Stitch screen IDs |
|--------|-----------------------|-------------------|
| Landing Page | Desktop (×2, see §6 OQ-S1) | `1ee6b7019af146848c614a3862e3c694`, `0c21f70dd06c45a4b43ca0aca934e049` |

**Key regions (Desktop):**
- `HEADER / NAV` — sticky top nav, 64px
- `HERO SECTION` — 600px tall, headline left + product screenshot right (2-col)
- `FEATURE CARD GRID` — 4-col at desktop, 2-col tablet, 1-col mobile
- `COMPARISON TABLE` — privacy/features vs competitors
- `PRICING TIERS` — 3-tier cards
- `BOTTOM CTA BANNER` — full-width purple gradient
- `FOOTER` — 200px

---

### Epic: Dashboard
| Screen | Breakpoints generated | Stitch screen ID |
|--------|-----------------------|------------------|
| Dashboard | Desktop | `42945722fe52447f81e5be244f7cbb33` |

**Key regions (Desktop):**
- `SIDEBAR NAV` — 240px left sidebar (Projects / Templates / Settings)
- `PAGE HEADER` — title + Create New Project button (primary)
- `STAT CARDS` — Storage / Exports / Active Projects — 3 cards in a row
- `PROJECT CARD GRID` — 3-col desktop, 2-col tablet, 1-col mobile. Each card: thumbnail + title + duration + overflow menu

---

### Epic: Editor Core
| Screen | Breakpoints generated | Stitch screen ID |
|--------|-----------------------|------------------|
| Main Editor | Desktop | `d0c1501471194e73b4a3de0ba9ac92e8` |

**Key regions (Desktop — fixed 1440×900 viewport):**
- `TOP BAR` — 48px: editable project title, undo/redo, version history, **renders** (transparent/BORDER button, PRIMARY pill badge when active renders > 0), share, export (primary CTA)
- `LEFT SIDEBAR` — 320px: Asset Browser / AI Tools tabs, asset list, upload button (note: implementation uses 320px for both tabs to prevent layout shift on tab switch; original spec was 240px)
- `REMOTION PLAYER` — center, 816×410px (16:9), video output + playback controls below
- `RIGHT SIDEBAR` — 280px Inspector: clip name, position, scale, opacity, trim in/out, captions, fill, effects
- `TIMELINE AREA` — 232px bottom: toolbar, track labels column, 4 track lanes (Video/Audio/Caption/Overlay), colored clip blocks, red playhead. Toolbar buttons follow a shared spec: 24×24px, transparent background, BORDER border, radius-sm (4px), TEXT_PRIMARY label/icon color, Inter font. Current toolbar buttons (left to right): "Scroll to beginning" (double-bar+chevron-left SVG, shown only when scrollOffsetX > 0), "Return to first frame" (single-bar+chevron-left SVG, shown only when playheadFrame > 0), Zoom out (−), zoom label (px/f readout), Zoom in (+), track count (right-aligned), Add Track menu.

**Tablet simplification:** preview takes full 768px width; inspector collapses to tabs; bottom toolbar replaces sidebars. Tablet Stitch screen not yet generated — see §10 OQ-S2.

---

### Epic: Asset Management
| Screen | Breakpoints generated | Stitch screen ID |
|--------|-----------------------|------------------|
| Asset Browser | Desktop | `3d7bcc0c282a40f0a1a5d933988da383` |
| Upload Modal | — (not yet generated) | see §10 OQ-S3 |

**Key regions:**
- `ASSET BROWSER PANEL` — 320px sidebar: type tabs, search, filter, asset list (thumbnail + filename + status badge), upload button
- `ASSET DETAIL PANEL` — 280px right: preview/waveform, metadata, status badge (success green = ready), replace/delete
- `UPLOAD MODAL` — 520×580px centered modal: drag-and-drop zone, browse button, per-file progress bars
- `UPLOAD BOTTOM SHEET` — Mobile: slides up from bottom, same content as modal

---

### Epic: AI Tools & Export
| Screen | Breakpoints generated | Stitch screen ID |
|--------|-----------------------|------------------|
| AI Captions Panel | — (not yet generated) | see §10 OQ-S3 |
| Export Modal | — (not yet generated) | see §10 OQ-S3 |

**Key regions:**
- `AI CAPTIONS PANEL` — 560px right panel: Generate button, style controls (font/size/color/position), editable caption list with timestamps
- `EXPORT MODAL` — 560×700px: preset grid (1080p/4K/720p/Vertical/Square/WebM), format selector, render progress bar, download + share
- `EXPORT BOTTOM SHEET` — Mobile: preset scroll row, progress bar, download CTA

---

### Epic: Sharing & History
| Screen | Breakpoints generated | Stitch screen ID |
|--------|-----------------------|------------------|
| Version History | — (not yet generated) | see §10 OQ-S3 |
| Share Modal | — (not yet generated) | see §10 OQ-S3 |

**Key regions:**
- `VERSION HISTORY PANEL` — 320px right panel: version entries (thumbnail + label + timestamp + diff + restore button), current version highlighted in primary-light
- `SHARE MODAL` — 480×500px: visibility toggle (Private/Unlisted/Public), URL field + copy button, password toggle, public preview thumbnail

---

## 9. Implementation Notes

- **Dark theme is the default** — `surface` (#0D0D14) as root background, all panels use `surface-alt` or `surface-elevated`
- **Editor layout is a fixed 1440×900 viewport** — no page scroll. Timeline + sidebars are fixed-height regions
- **Mobile-first for Marketing + Dashboard** — implement mobile styles as default, scale up with `min-width` media queries
- **Bottom nav on mobile** maps to sidebar nav on desktop
- **Bottom sheets on mobile** correspond to modals on desktop — same component, different presentation
- **All spacing uses the 4px grid** — avoid arbitrary values
- **Timeline tracks** use distinct colors: Video=`primary`, Audio=`primary-light`, Caption=`success`, Overlay=`warning`
- **Playhead** is always `error` red (#EF4444)
- **Glassmorphism hint** for sidebar panels: `backdrop-filter: blur(12px)` + `surface-alt` at 80% opacity
- **Stitch render scale ≠ logical target.** When reading a Stitch screen's `width`/`height`, divide by ~2 to get the logical pixel target. Never hard-code the raw Stitch dimensions.

---

## 10. Questions & Gaps

If something is unclear:
1. Query the Stitch project directly via the MCP tools in §7 — project ID `1905176480942766690`.
2. Use screen IDs from §6 to fetch exact layouts via `mcp__stitch__get_screen { name: "projects/1905176480942766690/screens/<screen_id>" }`.
3. Call `mcp__stitch__list_design_systems { projectId: "1905176480942766690" }` to read back the applied theme and its inlined `designMd`.
4. Fall back to the design-system token tables in §3 of this file for any unspecified color / spacing / typography / radius values — §3 is authoritative, not the Stitch echo.

### Known gaps (as of 2026-04-14)

- **OQ-S1 — Duplicate Landing Page screen.** `list_screens` on project `1905176480942766690` returns two Landing Page entries. During subtask 5 the first `generate_screen_from_text` attempt errored on the network and a retry was authorized — but the errored call evidently persisted a screen, and the retry created a second. Canonical: `1ee6b7019af146848c614a3862e3c694` (the one subtask 5's log captured). Needs triage: either delete the duplicate `0c21f70dd06c45a4b43ca0aca934e049` or promote it to an explicit variant via `mcp__stitch__edit_screens` / `mcp__stitch__generate_variants`. Decision deferred to a follow-up (not in EPIC 10 STAGE 1 scope).
- **OQ-S2 — Tablet and mobile variants missing.** Subtask 5 generated DESKTOP-only screens for Landing / Dashboard / Main Editor / Asset Browser. Marketing + Dashboard were originally designed mobile-first and need Tablet + Mobile counterparts via `mcp__stitch__generate_screen_from_text { deviceType: MOBILE | TABLET }`. Defer to post-Stage-1.
- **OQ-S3 — Secondary screens not yet ported.** Upload Modal, AI Captions Panel, Export Modal, Version History, Share Modal, Flow Diagrams — all existed in the original Figma source but were not in subtask 5's scope. Generate on demand when their implementation tickets come up.
- **OQ-S4 — Stitch theme persistence.** The `spacing` and `typography` maps sent to `mcp__stitch__create_design_system` during subtask 5 are NOT echoed back by `mcp__stitch__list_design_systems` — only the top-level theme fields and the inlined `designMd` markdown round-trip. Possibilities: (a) Stitch persists them but does not echo, (b) Stitch silently drops them. For any agent that needs exact token values, read §3 of this file — do not rely on the Stitch echo alone.

---

*Rewritten during EPIC 10 STAGE 1 — Design Tooling Migration, 2026-04-14. Stitch replaces Figma as the design source of truth for ClipTale v2.*
