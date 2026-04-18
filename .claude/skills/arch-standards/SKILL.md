---
name: arch-standards
description: >
  Generates a detailed architecture & code standards documentation file (.md) for any app idea and technology stack.
  Use this skill whenever a user provides a business idea, app concept, or project description alongside a proposed tech stack and wants a comprehensive guide for their development team.
  Trigger on phrases like "create architecture doc", "code standards for my app", "folder structure for", "best practices doc", "developer guidelines", "coding standards", "team documentation", "architecture guide", "where to put business logic", "project structure", or whenever someone describes an app + stack and wants guidance on how to build it properly.
  Also trigger when a user says things like "we're starting a new project", "onboard developers", "document our standards", or "how should we structure our codebase".
---

# Architecture & Code Standards Skill

This skill takes a business app idea + technology stack and produces a comprehensive, `.md` architecture and code standards document tailored to that specific project and stack.

---

## Tone & Writing Style

This document is written **for AI coding agents, not human developers**. Every section must follow these rules:

- **Be explicit and unambiguous.** Agents do not infer intent. Never write "keep things clean". Instead write: "All database queries must live in `src/repositories/`. A service may call a repository but must never import from `src/db/` directly."
- **Use positive and negative examples side by side** wherever a rule could be misapplied.
- **State exactly where code belongs**: give the file path, the layer name, and the pattern name together.
- **State exactly where code must NOT go**: agents need explicit forbidden zones as much as allowed ones.
- **Use imperative language throughout**: "Place X in Y", "Never call Z from W", "Always validate at the boundary".
- Each section should read like a strict, precise spec that leaves zero room for interpretation.

---

## Step 1: Clarifying Interview

Before generating anything, ask the user these questions (group them in a single message, don't split into multiple turns):

1. **Team size & experience** — How many developers? Are they junior, mid, senior, or mixed?
2. **App scale** — Is this an MVP/prototype, a medium-sized product, or a large-scale system?
3. **Monorepo or separate repos?** — Single repo for everything, or split (e.g. frontend / backend / mobile separate)?
4. **Any hard constraints?** — Existing codebases to integrate with, regulatory requirements, specific libraries they're locked into?
5. **Primary pain points** — What has caused problems in past projects? (e.g. messy state, unclear ownership of logic, inconsistent naming)

If the user already provided some of these in their initial message, skip those questions and only ask the missing ones.

---

## Step 2: Stack Analysis

Before writing the doc, internally reason about the tech stack:

- Identify the **layer type** of each technology (UI framework, state manager, backend framework, ORM, database, auth, etc.)
- Identify the **dominant architectural pattern** that best fits the stack (see reference table below)
- Note any **stack-specific conventions** to follow (e.g. Next.js has file-based routing, Laravel has service/repository conventions, Flutter favors BLoC or Riverpod)
- Flag any **potential friction points** between technologies (e.g. mixing server components with heavy client state)

### Architectural Pattern Reference

| Stack type | Recommended pattern |
|---|---|
| React / Vue / Angular SPA | Feature-based folder structure + custom hooks / composables for logic |
| Next.js / Nuxt (full-stack) | Server/client split, colocation by route, API routes as thin controllers |
| React Native / Flutter | MVVM or Clean Architecture, separate UI from business logic strictly |
| Node.js / Express API | Layered architecture: routes → controllers → services → repositories |
| Laravel / Django / Rails | MVC with service layer for complex business logic, thin controllers |
| NestJS | Module-based DDD, decorators for routing, services for logic |
| Monorepo (web + mobile + api) | Shared packages for types/utils, each app has its own architecture |

---

## Step 3: Generate the `.md` Document

Produce a well-structured Markdown document with ALL of the following sections. Tailor every section specifically to the provided stack — avoid generic advice that doesn't apply.

---

### Document Structure

```
# [Project Name] — Architecture & Code Standards

## 1. Project Overview
## 2. Tech Stack Summary
## 3. Folder Structure
## 4. Architecture & Design Patterns
## 5. Business Logic Placement
## 6. UI Logic Placement
## 7. State Management
## 8. API & Data Layer
## 9. Coding Style & Naming Conventions
## 10. Testing Strategy
## 11. Security Patterns
## 12. Environment Configuration
## 13. CI/CD Conventions
## 14. Team Conventions & Workflow Notes
```

---

### Section Writing Guide

#### 1. Project Overview
- One paragraph describing the app, its purpose, and the intended users.
- Note the team size and experience level this doc is written for.

#### 2. Tech Stack Summary
- Table listing each technology, its role, and why it was chosen (or assumed reason if not stated).

#### 3. Folder Structure
- Show a full annotated directory tree using code blocks.
- Each folder should have a comment explaining what belongs there.
- Show structure for each app (frontend, backend, mobile) separately if applicable.
- Include example files, not just folder names.
- **Be specific to the framework** — e.g. for Next.js use `app/`, for Laravel use `app/Services/`, etc.

Example format:
```
src/
├── features/           # Feature-based modules (one folder per domain feature)
│   └── auth/
│       ├── components/ # UI components scoped to this feature
│       ├── hooks/      # Business/UI logic for this feature
│       ├── api.ts      # API calls for this feature
│       └── types.ts    # Types scoped to this feature
├── shared/             # Reusable code with no feature dependency
│   ├── components/     # Generic UI components (Button, Modal, etc.)
│   ├── utils/          # Pure utility functions
│   └── types/          # Global types and interfaces
└── lib/                # Third-party library configs and wrappers
```

#### 4. Architecture & Design Patterns
- Name the primary pattern (e.g. "Clean Architecture", "Feature-Sliced Design", "MVC+Service Layer").
- Explain it in plain language — what it means for *this* project.
- Include a simple diagram using ASCII or Mermaid if helpful.
- Explain what goes in each layer and the **dependency rule** (which layers can call which).

#### 5. Business Logic Placement
This is critical. Be very explicit:
- Define what counts as "business logic" for this app (domain rules, calculations, validation, workflows).
- State exactly **where it lives** (e.g. `services/`, custom hooks, use-case classes, domain models).
- State **where it must NOT live** (e.g. not in components, not in controllers/routes, not in the DB layer).
- Show a short code example (pseudocode or real) illustrating correct vs. incorrect placement.

#### 6. UI Logic Placement
- Define what counts as "UI logic" (display state, form handling, animations, conditional rendering).
- State where it lives (e.g. component-local state, UI store, custom hooks).
- Distinguish clearly from business logic with an example.
- Rule of thumb for when to extract UI logic to a hook/composable vs. keep inline.

#### 7. State Management
- Recommend the state management approach for this stack.
- Split into: **server state** (data from API), **client/UI state** (local interactions), **global app state** (auth, theme, session).
- Give guidance on which tool handles which (e.g. React Query for server state, Zustand for global UI state, useState for local).
- Anti-patterns to avoid for this stack.

#### 8. API & Data Layer
- How API calls are structured and where they live.
- Naming conventions for API functions/services.
- Error handling pattern (how errors propagate from API to UI).
- If applicable: repository pattern, ORM usage conventions, query organization.
- How to handle loading, error, and empty states consistently.

#### 9. Coding Style & Naming Conventions
Cover all of the following:
- **File & folder naming**: camelCase, PascalCase, kebab-case — which for what.
- **Component naming**: when to use nouns vs. descriptive names.
- **Function naming**: verb-first convention (e.g. `getUserById`, `handleSubmit`, `formatDate`).
- **Variable naming**: booleans (`isLoading`, `hasError`), arrays (plural nouns), constants (UPPER_SNAKE_CASE).
- **Type/interface naming** (if TypeScript): prefix `I`, suffix `Type`, or plain — pick one and stick to it.
- **Import ordering**: external → internal → relative, with blank lines between groups.
- **Max file length**: recommended line limit and what to do when exceeded.
- **Comments**: when to write them, what style (JSDoc, inline, block), what NOT to comment.

#### 10. Testing Strategy
- **Unit tests**: what to test (services, utils, hooks), what NOT to test (implementation details, framework internals).
- **Integration tests**: scope and tooling.
- **E2E tests**: what critical user flows to cover.
- **Test file location**: colocated vs. separate `__tests__` folder.
- **Naming convention** for test files and test descriptions.
- **Coverage expectations**: which layers need high coverage vs. which are lower priority.
- Recommended testing libraries for the stack.

#### 11. Security Patterns
Write this section as explicit, actionable rules an AI coding agent can follow without ambiguity. Cover:
- **Authentication & authorization**: where auth checks happen (middleware, guards, decorators — never inside business logic or UI), how roles/permissions are enforced.
- **Input validation**: validate at the boundary (API entry point), never trust client input, which library to use (e.g. Zod, Joi, class-validator).
- **Secrets handling**: never hardcode secrets, never log sensitive fields, never expose internal error details to clients.
- **Data sanitization**: when and where to sanitize (e.g. before DB writes, before rendering user content).
- **HTTP security**: headers to set (CORS policy, Content-Security-Policy, HTTPS enforcement), rate limiting placement.
- **Dependency safety**: keep dependencies updated and audit regularly.
- For each rule, state: what to do, where to do it, and what NOT to do.

#### 12. Environment Configuration
Write this section so an AI agent knows exactly how to handle config in any file it touches. Cover:
- **Environment files**: which files exist (`.env`, `.env.local`, `.env.production`), what goes in each, which are committed to version control (hint: none containing secrets).
- **Variable naming**: prefix conventions (e.g. `NEXT_PUBLIC_` for client-exposed vars, `APP_` for backend vars).
- **Validation at startup**: the app must validate all required env vars on boot and fail fast with a clear error if any are missing — specify the library to use (e.g. `envalid`, `zod`).
- **Access pattern**: env vars are accessed only through a central config module, never via `process.env` scattered throughout the codebase.
- **Per-environment overrides**: how staging vs. production config differs and how that's managed.
- Provide the exact folder path and file name where the config module lives.

#### 13. CI/CD Conventions
Write this section so an AI agent understands what checks run automatically and what standards code must meet before merging. Cover:
- **Pipeline stages**: list each stage in order (e.g. lint → type-check → unit tests → integration tests → build → deploy) and what tool runs each.
- **Branch strategy**: which branches exist (`main`, `develop`, `feature/*`, `hotfix/*`), what triggers a deploy to which environment.
- **PR requirements**: what must pass before a PR can merge (CI green, review approvals, no unresolved comments).
- **Deployment process**: how code gets from merged PR to production (automated vs. manual gate, rollback procedure).
- **Secrets in CI**: how secrets are injected (environment variables in CI platform, never in code or logs).
- **Artifact management**: how build outputs are stored, named, and versioned.

#### 14. Team Conventions & Workflow Notes
- PR size recommendations (small, focused PRs).
- Commit message format (conventional commits or custom).
- Code review focus areas specific to this architecture.
- Any "golden rules" tailored to the team's pain points (from Step 1).

---

## Step 4: Output

- Save the document as a `.md` file named `[project-name]-architecture-standards.md`
- Copy to `/mnt/user-data/outputs/`
- Present to the user with `present_files`
- In chat, give a short 2–3 sentence summary of the key architectural decisions made and why they fit this stack.

---

## Quality Checklist

Before saving, verify:
- [ ] Every section is present and has stack-specific content (no placeholder text)
- [ ] Folder structure uses real framework conventions, not generic names
- [ ] Business logic and UI logic sections each have a concrete correct vs. incorrect code example
- [ ] Security section states what to do AND what not to do for each rule
- [ ] Environment config section names the exact config module file path
- [ ] CI/CD section lists every pipeline stage in order with the tool that runs it
- [ ] Naming conventions are internally consistent throughout the doc
- [ ] Every rule uses imperative language ("Place", "Never", "Always") — zero vague advice
- [ ] No section gives generic advice that would apply to any project — everything is stack-specific
