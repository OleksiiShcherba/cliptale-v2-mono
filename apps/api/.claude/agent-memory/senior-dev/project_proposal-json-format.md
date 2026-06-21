---
name: proposal-json-format
description: Cast-extraction proposal_json format stored in storyboard_cast_extraction_jobs; the existing seedExtractionJob test helper writes a flat array (not the correct format); use seedExtractionJobWithProposal for canonical format
metadata:
  type: project
---

The `proposal_json` column in `storyboard_cast_extraction_jobs` holds:
`{ cast: [{ type: "character"|"environment", name: string, description: string, image_file_ids: string[], scene_block_ids: string[], per_run_estimate: number }] }`

The schema is defined in `cast-extract.job.ts` as `castProposalSchema` using Zod.

**Why:** The legacy test helper `seedExtractionJob` in `storyboardReference.confirm.service.test.ts` writes a flat array `JSON.stringify(proposal)` (no `cast` wrapper). This is technically wrong but existing tests only check block/flow counts, not scene links. The new `seedExtractionJobWithProposal` helper (added in subtask 2) uses the correct `{ cast: [...] }` format.

**How to apply:** When writing new tests that exercise the proposal-parsing path (e.g. proposal fallback for scene link resolution), always use the canonical `{ cast: [...] }` format or the `seedExtractionJobWithProposal` helper.
