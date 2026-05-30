---
status: Draft
owner: "Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-05-30"
feature_size: "S"
target_surfaces: [web-frontend]  # §4 decision — single surface; backend reused unchanged. Read (never re-derived) by api/sequences/tasks/plan-tests/review → _shared/surfaces.md
---

# Software Architecture Document — storyboard-status-block-actions

<!-- 12 Arc42 sections. Empty section → <!-- N/A: <one-line reason> -->. -->
<!-- C4 Context (L1) lives inline in §3. C4 Container (L2) lives inline in §5. -->
<!-- Numbers in §10 come VERBATIM from spec.md §6 NFR — no inventing, no rounding. -->

## 1. Introduction and goals

<!-- 🎯 Why: durable memory of «what + the three dominant qualities + who cares». A year from
     now nobody recalls which three qualities were critical for this system.
     📋 Write: 1 ¶ intent + 3 lines of top-3 quality goals + a stakeholders table.
     ¶4 is the override slot — critic `Override` resolutions emit «Decision override: <headline>
     — rationale: <reason>» bullets here so downstream skills see the deliberate choice. -->

**Intent.** Give each **completed** storyboard status block ("Generated scenes applied", "Illustrations ready") a kebab (⋮) **status menu** — revealed on hover/focus, kept in the tab order — exposing two in-place actions for the draft's **Creator**: **Regenerate** (re-runs the underlying generation) and **Hide** (removes the block for the current session). Scene Regenerate is destructive (overwrites the canvas) and is gated by a single confirmation that enumerates present losses; illustration Regenerate is additive (no confirmation). The "Illustrations ready" block drops its stray "Ref" preview so the two completed blocks read as one consistent control. This is a frontend-only change to existing storyboard Step-2 controls — no new backend, no new data.

**Top-3 quality goals (1-liners; full scenarios in §10):**

1. **Destructive-action safety** — 100% of scene-Regenerate triggers show the loss-enumerating warning before any overwrite (spec §6).
2. **Accessibility** — the status menu is keyboard-reachable and fully operable (focus → activate → Escape to close) (spec §6).
3. **Responsiveness** — status-menu open latency ≤ 100 ms from activation to visible menu content (spec §6, non-gating).

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Creator | Owns the draft; uses Regenerate / Hide on completed blocks | No |
| Non-owner viewer | Sees the consistent completed blocks but no status menu (AC-09) | No |
| Steven Hayes (PM) | Feature owner; usability outcome + KPIs | No |
| Tech Lead | SAD approval | Yes |
| Security Lead | Confirms no new authz boundary (reuses existing ownership) | No |

<!-- Decision overrides (¶4) — populated by the critic resolution loop, empty otherwise. -->

## 2. Constraints

<!-- 🎯 Why: §4 strategy only works when §2 has fixed WHAT IS ALREADY FIXED — stack, versions,
     deadline, regulatory. This is an input, not an output.
     📋 Write: four blocks — Technical / Organisational / Conventions / Regulatory.
     📌 Pin versions («<datastore> 18», not «<datastore>»); «Q3 deadline — hard», not «ideally».
     Never N/A — every feature inherits at least Conventions + Technical. -->

**Technical.**
- TypeScript 5.4+ (strict, ESM); Node ≥20 monorepo (Turborepo + npm workspaces).
- React 18 + Vite 5 SPA (`apps/web-editor`); React-Router v7; TanStack Query 5.
- Client state: custom external store + `useSyncExternalStore` + Immer (`store/project-store.ts`); ephemeral UI state in `store/ephemeral-store.ts`. **No Zustand/Redux.**
- Styling: plain inline `CSSProperties` in co-located `*.styles.ts` (no Tailwind / CSS-modules / styled-components).
- **No backend, no datastore, no migration.** Regenerate reuses the existing generation-start paths already in the storyboard hooks (`useStoryboardPlanGeneration.start`/`retry`, `useStoryboardIllustrations.start`).

**Organisational.**
- Effort budget: S (small, frontend-only — single component cluster under `features/storyboard/`).
- Deadline: none stated (usability improvement).
- Team: one frontend engineer; PM owner Steven Hayes; reviewers Tech Lead + Security Lead.

**Conventions.**
- Architecture map: [`docs/architecture-map.md`](../../architecture-map.md) (canonical for layering, conventions, datastores).
- Feature code under `apps/web-editor/src/features/storyboard/`; the two status blocks render in `StoryboardPlanControls.tsx`, wired in `StoryboardPageWorkspace.tsx`.
- Co-located `*.styles.ts` inline styles; design tokens are hardcoded `*.styles.ts` constants (palette/`docs/design-guide.md`).
- **Shared-migration rule:** a module gaining a 2nd consumer migrates to `shared/` in the same PR.
- Modal pattern: feature-local React modal with focus-trap + Escape (precedent: `PrincipalImageApprovalModal.tsx`).

**Regulatory / external.**
- N/A — no new data, no PII, no new external interface. Hide state is session-only client state and is not persisted. Authorization reuses the existing draft-ownership rule already enforced by the generation backend (spec §6.1).

## 3. Context and scope

<!-- 🎯 Why: draws the SYSTEM BOUNDARY — who talks to it from outside, where the trust zone ends.
     Without §3, §5 and §8 (authorization) blur — unclear what's «inside» vs «outside».
     📋 Write: 2–3 sentences of business context + an external-systems table + a C4Context block.
     📌 «External: none (deliberate, no third-party in v1)» is itself a decision worth stating.
     Trust boundary — the line past which you don't trust data without checking it.
     Never N/A — greenfield still draws the planned actors + external systems. -->

A Creator builds a storyboard draft in the web-editor (Step 2). The two top-left status blocks reflect generation state; today they are terminal once complete. This feature adds Creator-only in-place actions (Regenerate, Hide) to the completed state of those blocks. The change lives entirely inside the `web-editor` SPA; the generation backend (api + media-worker) is reused unchanged — Regenerate simply re-invokes the existing start path, and ownership is enforced exactly as it is today.

<!-- brownfield: existing `features/storyboard/` module — `StoryboardPlanControls.tsx` renders both completed blocks; wired in `StoryboardPageWorkspace.tsx`; generation via the plan/illustration hooks; current-user identity via `useAuth()`. -->

**External systems (in / out):**

| Actor or system | Type | Interaction |
|---|---|---|
| Creator | Person | Opens the status menu on a completed block; triggers Regenerate / Hide |
| Non-owner viewer | Person | Views the draft's completed blocks; the menu is not rendered for them |
| ClipTale backend (api + media-worker) | System (internal, reused) | Starts scene-plan / illustration generation; enforces draft ownership |
| Identity (AuthProvider / `GET /auth/me`) | System (internal, reused) | Supplies the signed-in user id used to owner-gate the menu |

**C4 Context (L1):** <!-- syntax → references/c4-mermaid-syntax.md. Real names, no <placeholder> stubs. -->

```mermaid
C4Context
    title storyboard-status-block-actions — System Context

    Person(creator, "Creator", "Edits a storyboard draft; acts on completed status blocks")
    System(web, "web-editor (storyboard)", "React SPA hosting the status blocks + status menu")
    System_Ext(backend, "ClipTale backend", "api + media-worker: starts generation, enforces draft ownership")

    Rel(creator, web, "Opens status menu, triggers Regenerate / Hide", "HTTPS")
    Rel(web, backend, "Re-runs scene-plan / illustration generation (existing start path)", "REST / WS")
```

## 4. Solution strategy

<!-- 🎯 Why: the 3–4 STRATEGIC PILLARS every ADR grows from. Without §4 each ADR looks random —
     there's no umbrella. ⭐ The densest section — the blast-radius gate fires almost always here
     (decisions are irreversible + multi-module).
     📋 Write: 3–4 choices; each a heading + 2–3 sentences of rationale.
     📌 «Store content as a table of typed blocks» is a pillar — ADR-0001 grows from it. -->

**Target surface:** `web-frontend` (single) — the existing `apps/web-editor` React SPA. The generation backend (api + media-worker) is reused unchanged. Single-surface, reversible → inline note, no ADR. **UI architecture:** reuse the existing client-rendered SPA (React 18 + Vite, React-Router v7) — no SSR/hybrid change; this feature adds components to an existing screen, so no new UI-architecture decision is warranted (inline note, no ADR).

**Top strategic choices (the seeds for ADRs):**

1. **Reuse the existing generation-start path; gate Regenerate safety by action type** *(→ ADR-0001)* — Scene Regenerate calls the existing destructive plan-start (`planGeneration.start`/`retry`, which rebuilds the canvas) behind a mandatory loss-enumerating confirmation; illustration Regenerate calls the additive illustration-start (`illustrationGeneration.start`) with no confirmation. This honours the "no new generation-timing budget" constraint (spec §6) and the destructive-action-safety quality goal (§1 QG-1). The single-generation invariant (AC-07) is structural: choosing Regenerate immediately moves the block out of its completed state, removing the menu — so a rapid duplicate trigger has no menu to act on, backed by the existing start-guard in the plan hook.

2. **Owner-gate the status menu by not rendering it for non-owners** *(→ ADR-0002)* — The kebab (⋮) menu — the sole host of both actions — is not rendered when the signed-in user (`useAuth()`) is not the draft's Creator (AC-09). No new server boundary is introduced: generation ownership is already enforced server-side, and Hide is pure client session state. The "Ref"-removal and visual-consistency styling are independent of ownership and apply to **every** viewer.

3. **Hide is ephemeral, session-scoped client state — no persistence** — Hiding a completed block sets session-only UI state; it is not written to the server (spec §3 non-goal). A hidden block re-appears on reload or whenever that block re-enters a new generation cycle (including indirectly — a scene Regenerate that rebuilds the canvas and restarts illustrations re-shows a previously hidden "Illustrations ready" block). Where this state lives is a §5 building-block decision (reversible, single-module → no ADR).

4. **Extend the existing controls in place** — The status menu and the destructive-confirmation modal are added to the existing `StoryboardPlanControls.tsx` cluster following repo conventions (co-located inline `*.styles.ts`; feature-local modal with focus-trap + Escape, per `PrincipalImageApprovalModal.tsx`). No restructuring of the storyboard module; in-progress and failed block states are untouched (spec §3 non-goal).

Each tactical decision in later sections should trace to one of these seeds. Tactical decisions that *contradict* a strategic choice are red flags — surface them in §11.

## 5. Building block view

<!-- 🎯 Why: INTERNAL DECOMPOSITION — modules, containers, datastores. The static topology: who
     may talk to whom. Without §5, §6 (the flows) has no vocabulary of participants.
     📋 Write: 1 ¶ on the style (layered / hexagonal / clean / event-driven) + a folder tree + a
     C4Container block.
     📌 Draw ONE Container per declared `target_surface` (frontmatter): a fullstack
     [backend-service, web-frontend] = a backend-API container + a web/SPA container; a
     [backend-service, mobile-app] = the API + the mobile app. The Container(web, …) line below is
     just one surface's container — swap/add per what was declared in §4. → _shared/surfaces.md
     📌 e.g. «web app, content API, media worker, datastore, object store, CDN». -->

<One paragraph: layered / hexagonal / clean / event-driven, and why.>

**Internal decomposition:**

```
<e.g. modules/<feature>/>
├── domain/       <entities + sentinel errors>
├── app/          <use cases / services>
├── infra/        <repository + integration impl>
├── ports/        <handlers, DTOs, error mapping>
└── wiring        <self-wiring entry point>
```

**C4 Container (L2):** <!-- syntax → references/c4-mermaid-syntax.md. Real names, no <placeholder> stubs. ONE Container per declared target_surface (frontmatter); the web container below is one example surface. -->

```mermaid
C4Container
    title <feature> — Containers

    Person(actor, "<Actor>")

    Container_Boundary(app, "<Our system>") {
        Container(web, "<Web/UI>", "<technology>", "<purpose>")
        Container(api, "<API/handler>", "<technology>", "<purpose>")
        ContainerDb(db, "<Datastore>", "<technology>", "<purpose>")
    }

    System_Ext(ext, "<External>", "<purpose>")

    Rel(actor, web, "<interaction>", "<protocol>")
    Rel(web, api, "<calls>")
    Rel(api, db, "<reads/writes>", "<driver>")
    Rel(api, ext, "<emits>", "<protocol>")
```

## 6. Runtime view

<!-- 🎯 Why: the RUNTIME FLOW of 1–2 critical scenarios — who talks to whom, when, in what order.
     Without §6, §5 is just boxes with no life.
     📋 Write: a Mermaid sequenceDiagram. Participants are names from §5 (don't invent new ones).
     Messages are semantic («saves a draft»), NO HTTP verbs / paths / status codes — endpoint-level
     sequences arrive at the `api` stage.
     📌 e.g. «author → web: composes draft → web → content API: save». Seed the primary flow(s) here;
     the `sequences` stage then covers every §5 AC (no cap). Never N/A for M+; XS/S keeps ≥1 happy-path flow. -->

**Critical flow 1: <flow name>**

```mermaid
sequenceDiagram
    actor Actor
    participant Web
    participant Service
    participant Store
    Actor->>Web: <action>
    Web->>Service: <call>
    Service->>Store: <write>
    Store-->>Service: ok
    Service-->>Web: result
    Web-->>Actor: confirmation
```

**Critical flow 2: <e.g. async event propagation>** — <if applicable, otherwise N/A>.

## 7. Deployment view

<!-- 🎯 Why: the TOPOLOGY DevOps must know without reading the deploy charts — how many replicas,
     where the background worker lives, AT WHAT NUMBERS we scale.
     📋 Write: 2–3 sentences on topology + monitoring + concrete threshold numbers.
     📌 e.g. «500 authors → partition by quarter» (not «we'll think about scale later»).
     🎯 N/A allowed for XS/S that reuses an existing deployment unit with no change.
     Deployment-diagram scaffold → templates/deployment.md. -->

<Topology in 2–3 sentences. Where it runs, replicas, scaling thresholds.>

**Monitoring:**
- <Metrics — e.g. `<metric_name>`>
- <Alerts — e.g. «worker lag > 10 min → page on-call»>
- <Tracing — e.g. spans on the request boundary>

**Scaling thresholds:**
- <e.g. comfortable in one table up to N rows/year>
- <e.g. partition by quarter above N rows/year>

<!-- For XS/S with no deployment change: <!-- N/A: reuses existing deployment unit, no infra change --> -->

## 8. Crosscutting concepts

<!-- 🎯 Why: CROSS-CUTTING PATTERNS spanning several modules: logging, errors, authorization, ID
     strategy, events, caching. ⭐ The second-densest section. A pattern inside one module is NOT
     here; a project-wide convention belongs in the convention file.
     📋 Write: a table — concept / convention / where defined. One row per concept.
     📌 e.g. «sortable time-based IDs generated in the app layer» as a default from the convention file. -->

| Concept | Convention | Where defined |
|---|---|---|
| Logging | <e.g. structured, fields `module=<name>`> | <convention file §X or here> |
| Authentication | <e.g. token-based via middleware> | <convention file §X> |
| Error handling | <e.g. domain sentinel → ports error mapping → JSON> | <convention file §X> |
| ID strategy | <e.g. sortable time-based ID in the app layer> | <convention file §X> |
| Internationalisation | <e.g. N/A, single language> | — |
| Observability | <e.g. tracing on the request boundary> | — |
| Events | <module-specific patterns, if any> | <here> |

## 9. Architecture decisions

<!-- 🎯 Why: the REVERSE INDEX onto the adr/ folder. `ls adr/` gives the files; §9 gives the
     semantics — why they exist, which SAD section they attach to, what status.
     📋 Write: a 4-column table, one row per ADR. Mixed status is fine.
     📌 e.g. «0001 | Store content as a table of typed blocks | Accepted | §4». -->

| # | Title | Status | Section |
|---|---|---|---|
| <NNNN> | <imperative — e.g. "Use a sliding-window counter for rate limiting"> | Accepted | §<N> |
| <NNNN> | <imperative — e.g. "Co-locate the worker in the API process"> | Accepted | §<N> |

ADR files live under `docs/features/<slug>/adr/NNNN-<title>.md`.

## 10. Quality requirements

<!-- 🎯 Why: the QUALITY TREE — take a goal from §1 and break it into concrete leaves: tests,
     metrics, configs, drills. ⭐ Without §10, §1 is a manifesto. With §10 each declaration maps
     to something PROVABLE.
     📋 Write: per §1 goal — When / Then / How-verify. Numbers from spec §6 NFR VERBATIM (don't
     round ≤250ms to ≤300ms — that's a critic F6 hit).
     📌 e.g. «p95 ≤ 500 ms on a block update, verified by a 100 req/s load test». -->

Each top-3 goal from §1 expanded into a full scenario:

**QG-1. <quality attribute>**
- **When:** <trigger condition>
- **Then:** <expected behaviour with numbers from spec §6 NFR>
- **How verify:** <test / chaos drill / load test / metric>

**QG-2. <quality attribute>**
- **When:** <trigger>
- **Then:** <expected>
- **How verify:** <how>

**QG-3. <quality attribute>**
- **When:** <trigger>
- **Then:** <expected>
- **How verify:** <how>

## 11. Risks and technical debt

<!-- 🎯 Why: ⭐ collects EVERYTHING that can break — not only the technical. Without §11 risks get
     discussed at standups and lost; debt lives only in the head of whoever accepted it.
     📋 Write: a risk/debt table — severity — mitigation — owner. Accepted debt in its own block.
     📌 The first risk is often a product risk, not a technical one. That's normal. -->

<!-- Severity literals: Low / Medium / High for regular risks; "Open question" for rows created by
     a Save-as-OQ resolution during the Socratic walk (see references/socratic.md). -->

| Risk / debt | Severity | Mitigation | Owner |
|---|---|---|---|
| <e.g. Worker lag may reach hours during a downstream outage> | Medium | <alert >10 min, on-call playbook, retry backoff> | <DevOps> |
| <e.g. No event-schema versioning in v1> | Medium | <ADR-NNNN planned for v2, tolerate unknown fields> | <Backend> |
| Open architectural decision: <decision-headline> | Open question | Resolve before <stage trigger or YYYY-MM-DD>; <inline rationale from the Save-as-OQ> | <owner> |

**Accepted debt (acceptable in v1, plan to fix later):**
- <e.g. the entity is immutable / unversioned — OK for v1, may need audit versioning in v2>

## 12. Glossary

<!-- 🎯 Why: ⭐ the DOMAIN GLOSSARY that ends arguments a year later («checkpoint — weekly or
     biweekly? quarter — calendar or fiscal?»).
     📋 Write: a term / meaning table. Business + technical terms mixed.
     📌 e.g. «Lesson | a unit inside a course made of blocks (text, video)». -->

| Term | Meaning |
|---|---|
| <e.g. domain object A> | <its meaning in this domain> |
| <e.g. domain object B> | <its meaning> |
| <e.g. domain invariant name> | <the rule, in plain language> |
