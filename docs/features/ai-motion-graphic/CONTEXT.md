# CONTEXT — ai-motion-graphic

> Canonical domain glossary for the AI Motion Graphic feature. Definitions here are the
> single source of truth; spec / design / data-model read this. Each entry: one-sentence
> definition + a NOT-reference so a homonym can't drift. Generic tech words (HTTP, queue,
> cache, sandbox-as-OS-concept) are out of scope.

## Glossary

- **Creator** — the authenticated ClipTale account holder who uploads media, edits projects/storyboards, generates AI assets, and (with this feature) authors Motion Graphics. NOT a separate admin/reviewer role — there is one user role; ownership is per-account.
- **Motion Graphic** — a reusable, code-defined animated graphic (animated text, title card, lower-third, UI/infographic screen) owned by one Creator, consisting of a code component + a props schema + a fixed duration + frame rate + dimensions + status. NOT a rendered binary video file and NOT a stored image; it is source code that is executed to produce frames.
- **Component** — the unit of executable code that defines a Motion Graphic's visuals and animation. NOT the Motion Graphic record itself (which also carries duration, props schema, chat history); the Component is the code payload inside it.
- **Props schema** — the typed parameter definition that declares which inputs of a Motion Graphic are editable (e.g. text strings, colors). NOT the actual prop values of a placed instance; the schema is the shape, values are supplied per use. Laid into the data model from day one; values-edited-at-insertion is deferred (MVP2).
- **Duration** — the fixed time length of a Motion Graphic, a property of the graphic itself (derived from its code/fps). NOT independently trimmable at the insertion point in MVP1; a block inserting the graphic takes this duration as-is.
- **Chat history** — the persistent, never-deleted conversation between the Creator and the AI that authored and iteratively refined a Motion Graphic; it is the graphic's editable "source" and can be resumed at any time. NOT a transient UI log — it is durable state and the lineage of the component's code.
- **Instance** — a placement of a Motion Graphic inside a storyboard block, captured as a snapshot of the graphic's code + duration at insertion time. NOT a live reference: later chat edits to the source graphic do NOT change already-placed instances in MVP1.
- **Snapshot** — the frozen copy of a Motion Graphic's code and duration captured when it is inserted into a storyboard block. NOT the live graphic; it is immutable once placed (the basis for version-pinning in a later milestone).
- **Live preview** — the in-browser, real-time playback of a Motion Graphic's executed component while the Creator authors/iterates it. NOT the final server-side export render; the same component is later executed server-side at export.
- **Generated code execution** — running AI-authored Motion Graphic code to produce frames, in two environments: the browser (for live preview/authoring) and the server renderer (at final export). NOT trusted code — it is treated as untrusted input requiring isolation and determinism guarantees.
- **Determinism** — the guarantee that a Motion Graphic renders identically given the same frame inputs, so the browser preview matches the server export frame-for-frame. NOT wall-clock or random-driven animation; time/randomness sources that break frame reproducibility are disallowed.
- **Media asset** — any item attachable to a storyboard block as content, peer-level across kinds (image, video, audio, and — added by this feature — motion graphic). NOT limited to binary files stored in the file store; a Motion Graphic is a media asset that is code-backed.
- **Storyboard block** — an existing scene unit on the storyboard canvas to which media assets are attached. NOT introduced by this feature; this feature adds the motion-graphic kind to what a block can hold.
- **Design tokens** — project-level visual constants (fonts, colors, easing) that, in a later milestone, are injected into every generation prompt so all of a project's graphics look like one system. NOT in MVP1 scope; reserved for MVP2.
- **Cost estimate + confirm** — the existing gating pattern where a generation's price is computed server-side, shown to the Creator for confirmation, and re-validated server-side (client estimate never trusted) before the AI call runs; instrument-only (no credit deduction). NOT a credits/ledger system; it is an estimate-and-guard mechanism reused for Motion Graphic generation.
