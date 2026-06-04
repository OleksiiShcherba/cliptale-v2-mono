---
status: Draft
owner: "Steven Hayes (PM)"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-04"
feature_size: "M"
---

# Spec — storyboard-autosave-checkpoints

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** existing storyboard save/history code (`apps/web-editor/src/features/storyboard/` — autosave hook, history push hook, History panel; the api storyboard history routes) and `docs/architecture-map.md`; plus the interview + CONTEXT. No external channels read.

## 1. Context

Today every change a Creator makes on the storyboard board page (the "Video Road Map" step) does two things at once: it saves the current board state AND pushes a full history snapshot with a layout screenshot captured from the live canvas. During active editing this produces a steady stream of full-state snapshots and screenshot captures every minute. It overloads the system — needless storage and write churn on the back end, repeated capture work in the Creator's browser — and floods the 50-entry history with near-identical noise that evicts genuinely useful restore points within minutes.

The trigger: the overload is observed today and grows with every storyboard feature that adds content to the canvas (scene illustrations, music blocks, AI flows). The history that was meant to be a safety net is becoming both expensive and useless — the more actively a Creator works, the faster their meaningful restore points disappear.

The committed approach is a two-tier save model. (i) A **lightweight autosave** keeps persisting the current board state shortly after every change — data is never at risk — but creates no History entries and takes no screenshots. (ii) A **checkpoint save** — automatic once per Creator-configured **autosave interval** (presets 30 s / 1 / 2 / 5 / 10 min, default 1 min) and on-demand via a **Save** button — captures a **layout screenshot** and creates the **History entry**. A **checkpoint countdown bar** in the top-right makes the cadence visible; a brief full-screen loader marks each capture. Competitive research found no adjacent product combining screenshot previews in version history, a visible countdown, and a user-configurable checkpoint interval (Figma: fixed 30-min auto-checkpoints, no per-version preview; Miro/Canva: neither) — so the risk is execution quality, not differentiation. The sharpest failure vector found in review — a failed screenshot capture silently producing no restore point — is closed by design: a checkpoint whose capture fails still creates its History entry with the minimap preview. The interview's success criterion holds: history writes and screenshot work drop from per-change to at-most-one-per-interval.

Interview decisions recorded for traceability: the full-screen loader applies to both automatic and manual checkpoints; a checkpoint is deferred while the Creator is dragging or typing on the canvas (capped at one extra interval); idle intervals produce no checkpoints; a Restore is preceded by an automatic checkpoint of the current state when changes are newer than the last entry; the interval setting is stored per Creator account and edited on a new Settings page reachable from the Home left menu; legacy pre-feature history records are hidden from the panel, not deleted.

## 2. Goals

- Cut storyboard history writes and screenshot captures from "every change" to "at most one per autosave interval per draft", without reducing how fresh the saved board state is.
- Give Creators predictable, visual restore points and explicit control over them (countdown bar, manual Save, configurable interval).
- Introduce the product's first per-user settings surface (a Settings page in the Home left menu) as the home for this and future preferences.

## 3. Non-goals

- **Timeline-editor autosave** — untouched; this feature changes only the storyboard board page. (Different surface, different risks.)
- **Multi-tab / multi-device conflict resolution** — concurrent edits to the same draft keep today's last-writer-wins behaviour (tracked in §8). (Real-time collaboration is not in the product.)
- **Fine-grained per-change history** — intermediate states between checkpoints are deliberately not restorable; the granularity loss is the accepted price of the load reduction.
- **Cleanup or migration of legacy history records in storage** — they are only hidden from the panel and age out via the existing 50-entry pruning. (No data-destruction risk.)
- **Additional settings on the new Settings page** — it ships with the autosave interval only. (Scaffolding first.)

## 4. User stories

### US-01: Continuous lightweight autosave

**As a** Creator
**I want** my board changes saved automatically without screenshots or history noise
**So that** my work is never lost while the system stays fast

### US-02: Automatic screenshot checkpoints

**As a** Creator
**I want** a checkpoint save with a layout screenshot taken automatically at my configured interval
**So that** History holds visual restore points without me thinking about it

### US-03: Visible checkpoint countdown

**As a** Creator
**I want** a small countdown bar in the top-right of the board showing when the next automatic checkpoint happens
**So that** I always know when my next restore point is coming

### US-04: Manual checkpoint on demand

**As a** Creator
**I want** a Save button next to the countdown bar that creates a checkpoint immediately
**So that** I can lock in an important state before risky edits

### US-05: History shows only checkpoints

**As a** Creator
**I want** the History panel to list only checkpoint entries with previews
**So that** I can find the right restore point quickly without scrolling through noise

### US-06: Configurable autosave interval

**As a** Creator
**I want** to set my default autosave interval on a Settings page reachable from the Home left menu
**So that** the checkpoint cadence matches how I work

### US-07: Safe restore

**As a** Creator
**I want** my current state checkpointed automatically before a Restore is applied
**So that** rolling back never destroys my latest work

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** a Creator is editing their storyboard draft on the board page
**When** they make any change (add, move, edit, or remove a block or connection)
**Then** the system automatically saves the current board state shortly afterwards and the save indicator reflects it, with no screenshot taken

### AC-02 (US-01) — domain invariant

**Given** a Creator has made several changes since the last checkpoint save, all within one autosave interval
**When** they open the History panel before the next checkpoint
**Then** the list of History entries is unchanged — a lightweight autosave can never create a History entry

### AC-03 (US-02) — happy path

**Given** a Creator has changes newer than the last checkpoint save and their autosave interval elapses
**When** the automatic checkpoint save runs
**Then** a full-screen loader covers the page for the capture moment, and afterwards the History panel's newest entry shows the current board with its layout screenshot

### AC-03b (US-02) — concurrent edge: active interaction

**Given** the autosave interval elapses while the Creator is dragging a block or typing in a text field on the canvas
**When** the automatic checkpoint would fire
**Then** the system defers the checkpoint until the interaction ends and runs it immediately afterwards (deferred at most one extra interval, after which it runs anyway) — a screenshot never captures a half-finished interaction

### AC-03c (US-02) — edge: backgrounded tab

**Given** the board page tab has been in the background for longer than the autosave interval and changes are pending
**When** the Creator returns to the tab
**Then** one overdue checkpoint save runs shortly after the return, and the regular countdown resumes

### AC-04 (US-02) — error path: screenshot capture failure

**Given** an automatic or manual checkpoint save runs and the layout-screenshot capture fails
**When** the checkpoint completes
**Then** the History entry is still created and shown with the minimap preview in place of the screenshot — a checkpoint is never silently dropped

### AC-05 (US-02) — domain invariant: no idle checkpoints

**Given** no changes have been made since the last checkpoint save
**When** the autosave interval elapses
**Then** no new History entry is created, and the checkpoint countdown bar shows an "all saved" idle state instead of counting down

### AC-06 (US-03) — happy path

**Given** a Creator makes a change after the last checkpoint save
**When** they look at the top-right of the board page
**Then** the checkpoint countdown bar is visible and counting toward the next automatic checkpoint, and it resets after every checkpoint save (automatic or manual)

### AC-07 (US-04) — happy path

**Given** a Creator wants an immediate restore point
**When** they press the Save button next to the countdown bar
**Then** a checkpoint save runs at once — full-screen loader during capture, a new History entry with the screenshot on top — and the interval countdown restarts

### AC-07b (US-04) — concurrent edge: double-save protection

**Given** a checkpoint save is currently in progress
**When** the Creator presses the Save button again
**Then** the button is inactive until the running checkpoint finishes — no second concurrent checkpoint starts

### AC-08 (US-05) — happy path

**Given** a draft has both legacy pre-feature history records and new checkpoint entries
**When** the Creator opens the History panel
**Then** only checkpoint entries are listed, newest first, each with its preview and restore control; legacy pre-feature records are not shown

### AC-09 (US-06) — happy path

**Given** a signed-in Creator opens the Settings page from the Home left menu
**When** they pick a different autosave-interval preset (30 seconds, 1, 2, 5, or 10 minutes) and the change is stored
**Then** the system confirms the change and the new interval governs the next checkpoint scheduling on any of their storyboard drafts

### AC-10 (US-06) — cross-context

**Given** a Creator changed their autosave interval on the Settings page
**When** they open any of their storyboard drafts in another browser or on another device after signing in
**Then** the checkpoint countdown there uses the updated interval — the setting follows the account, not the browser

### AC-11 (US-06) — error path: setting not saved

**Given** the Settings page cannot store a changed interval (for example a connectivity problem)
**When** the Creator attempts the change
**Then** the system tells the Creator the change was not saved and keeps showing the previously stored interval

### AC-11b (US-06) — error path: setting not loaded

**Given** the Creator's stored interval cannot be loaded when the board page opens
**When** the Creator keeps editing
**Then** checkpoints run at the default interval of 1 minute for that session and editing is never blocked

### AC-12 (US-07) — happy path

**Given** a Creator has changes newer than the latest History entry
**When** they confirm a Restore of an older History entry
**Then** the system first creates a checkpoint of the current state (it becomes the newest History entry), then applies the restore — the pre-restore work stays restorable

### AC-13 (US-05) — authorization

**Given** a signed-in user who is not the Creator of a draft
**When** they attempt to open that draft's board page or its History
**Then** the system denies access — a draft, its saves, and its History entries are accessible only to their Creator

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| History writes during active editing | ≤ 1 History entry per autosave interval per draft (vs one per change today) | history-table row-creation rate, before/after comparison |
| Full-screen loader visibility (checkpoint capture) p95 | ≤ 1 s | e2e timing in CI + manual spot-checks (no browser telemetry in production yet) |
| Lightweight autosave server confirmation p95 | ≤ 500 ms | API request logs |
| History panel load p95 | ≤ 500 ms | API request logs |
| Screenshot-capture failure share | < 2% of checkpoint entries | share of entries showing the minimap fallback (countable server-side) |
| Settings read on board open p95 | ≤ 300 ms | API request logs |

## 6.1 Security / privacy

- **Data classification:** internal — board snapshots and layout screenshots contain Creator content (scene text, generated imagery).
- **Personal data touched:** one new per-user preference (autosave interval) — non-sensitive; screenshots carry the same sensitivity as the existing board snapshots.
- **AuthZ/AuthN impact:** the new settings capability is readable and writable only by the authenticated account owner; draft save/history operations stay scoped to the draft's Creator (existing ownership rule restated for the new surfaces).
- **Abuse cases:**
  - cross-account settings tampering → denied; settings are bound to the authenticated account.
  - a non-owner reading another Creator's History entries or screenshots → denied; drafts and their history are visible only to their Creator.
  - manual-Save spam → the Save control is inactive while a checkpoint is in flight; the automatic cadence is floored by the 30-second minimum preset.
  - oversized board snapshot submissions → blocked with a plain-language error (limits unchanged from today's saves).
- **Security review:** Required (M-size feature introducing the product's first per-user settings surface).

## 7. Metrics / KPIs

- **History snapshot writes per active editing hour per draft** — baseline: TBD, measured by counting history-table row creation over one week before release; target: ≥ 90% reduction within 14 days after release.
- **Share of checkpoint entries with a real layout screenshot** — baseline: n/a (new mechanism); target: ≥ 98% within 30 days (the remainder show the minimap fallback).
- **"Restore destroyed my newer work" complaints** — baseline: n/a; target: 0 support tickets within 60 days after release.

## 8. Open questions

- [ ] Multi-tab / multi-device editing of the same draft: keep last-writer-wins, or guard checkpoints against stale-tab overwrites? Default now: last-writer-wins (as today). — owner: Steven Hayes (PM), due: before sdd:design
- [ ] Does the 50-entry history cap stay at 50 now that entries are checkpoint-only (a longer covered time horizon)? Default now: keep 50. — owner: Steven Hayes (PM), due: before sdd:data-model
- [ ] Who runs the pre-release baseline measurement for the KPI-1 write-rate? Default now: dev runs a one-week count before the release branch. — owner: Tech Lead, due: before sdd:implement
