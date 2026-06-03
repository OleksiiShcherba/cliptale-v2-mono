---
id: T17
title: "Build FlowCanvas + Content/Generation/Result nodes + typed-connection block + model-change reconciliation"
layer: "ui"
deps: ["T5", "T16"]
acs: ["AC-02", "AC-07", "AC-15", "AC-18"]
files_hint: ["apps/web-editor/src/features/generate-ai-flow/components/FlowCanvas.tsx", "apps/web-editor/src/features/generate-ai-flow/components", "apps/web-editor/src/features/generate-ai-flow/hooks/useFlowCanvas.ts"]
owner: "Frontend Lead"
estimate: "L"
status: "todo"
---

# T17 — FlowCanvas + nodes + typed connections + reconciliation

## Why

The canvas is the feature's core surface: assemble blocks, see model-aware typed handles, block incompatible connections at connect-time (≤100 ms, no server round-trip), reuse a result as input, and reconcile handles when the model changes. Derives from [spec §US-02/03/07 + §AC-02/07/15/18](../spec.md), [sad §4 strategic choice 4 / §6 Flow 4/5/6 / §8 Model-change reconciliation / Result reuse](../sad.md), [ADR-0006](../adr/0006-declare-modality-and-exclusivity-groups-in-the-model-catalog-schema.md).

## What

An `@xyflow/react` canvas (the storyboard editor family) in `components/FlowCanvas.tsx` + `{Content,Generation,Result}Node` + `hooks/useFlowCanvas.ts`. A generation node renders one input handle per the selected model's required inputs, **typed by catalog modality** (T5). On connect, compare source vs handle modality from the client-side catalog: incompatible drop refused with the expected-modality hint (AC-02); a result node's output may connect into a compatible input (AC-18). Changing a generation node's model rebuilds its handles, prunes now-incompatible edges (listing which were removed), and **preserves** any existing result node + its library linkage — only input edges change (AC-07).

## Definition of Done

- [ ] Adding content + generation blocks and selecting a model renders the model's required input handles (AC-15)
- [ ] An incompatible drop is refused at connect-time with the expected-modality hint; feedback ≤100 ms, no server call (AC-02)
- [ ] A result node output connects into a modality-compatible input (AC-18)
- [ ] Changing the model reconciles handles + prunes incompatible edges, telling which were removed, and keeps existing result nodes intact (AC-07)
- [ ] Component tests cover accept/reject + reconciliation; lint + typecheck clean

## Notes

Depends on T5 (catalog modality/exclusivity is the single source) + T16 (the page shell). Connection validity is client-side only — the server re-validates at Generate (T11). Lazy-render off-screen previews to hold the open-latency target for large graphs (sad §11).
