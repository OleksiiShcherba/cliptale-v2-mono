# CONTEXT — generate-ai-flow

> Feature-local glossary. Roles and terms here are canonical for this feature's spec and downstream stages.

## Glossary

- **Creator** — the signed-in user who owns and edits their generation flows in the web editor. The only acting role for this feature. (Maps to the "Creator" actor in `docs/architecture-map.md`; all flows and library assets are owned per-user.) A signed-in user who is **not** the owner of a given flow (a non-owner) has no access to that flow or its results.
- **Generate AI page** — a new top-level page (sibling to Projects and Storyboard in the home navigation) that lists the Creator's generation flows and lets them create, open, rename, and delete flows.
- **Generation flow** (or **flow**) — a saved, reloadable document owned by a Creator: a node graph (blocks + connections + positions + per-block parameters + result links) that the Creator assembles to experiment with AI models. Listed on the Generate AI page; opens into the flow canvas.
- **Flow canvas** — the node-graph editing surface of a single flow (same node-canvas layout family as the storyboard Step 2 editor), where the Creator adds blocks and draws connections.
- **Content block** — a block that supplies input to generation blocks. Four kinds: **text** (a free-text field), **image**, **audio**, **video** (each holding a media asset supplied by upload **or** picked from the general library).
- **Generation block** — a block that runs a chosen AI model to produce media. Three kinds by output modality: **image generation**, **video generation**, **audio generation**.
- **Capability** — the model's declared transformation (e.g. text→image, image→video, text→video, image edit, text→speech, music generation). Determines which inputs a generation block requires.
- **Model** — a specific AI model from the existing catalog, with a declared capability and an input schema (required + optional fields, each with a modality type). Selected inside a generation block.
- **Input handle** — a typed connection point on a generation block, one per **required** input field of the selected model, labelled and typed by modality (text / image / audio / video).
- **Multi-input handle** — an input handle for a model field that accepts several inputs of the same modality (the "three dots" handle); accepts more than one incoming connection.
- **Optional input** — a non-required model input shown as a secondary/optional handle (e.g. an end-frame image).
- **Connection** (or **edge**) — a directed link from a source block's output to a generation block's input handle. A connection is **compatible** only when the source's output modality matches the input handle's modality.
- **Output connection** — the link from a generation block to its result block.
- **Result block** — the block that displays a generation block's output (progress, then the produced media). Auto-created (or reused) when the Creator presses Generate.
- **Inspector** — a side panel that opens on block selection; for a generation block it renders the model's **optional** (non-handle) parameters as a form.
- **General library** — the Creator's user-scoped asset store (the existing `files`-backed library) where all generated results and all uploads live, independent of any project, draft, or flow.
- **Generate** — the per-generation-block action that runs the selected model on the block's resolved inputs, after a cost confirmation, producing a result into the result block and the general library.
- **Cost confirmation** — a pre-Generate prompt that surfaces the estimated cost of the run and requires the Creator to confirm before any paid provider call is made.
- **Model-input compatibility** — the named invariant that a connection may only be made between matching modalities, and that a generation block may only run when every required input is satisfied (including model-specific exclusivity rules such as "exactly one of two alternative inputs").
