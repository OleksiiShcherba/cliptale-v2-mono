# Senior Dev Memory Index

- [Proposal JSON format](project_proposal-json-format.md) — cast-extraction proposal_json shape is `{ cast: [{type, name, description, scene_block_ids, ...}] }`; the legacy test seedExtractionJob writes a flat array (wrong for parser); use seedExtractionJobWithProposal for correct format
- [Reference confirm service — proposal fallback](project_reference-confirm-proposal-fallback.md) — subtask 2 done 2026-06-21: legacy /references/confirm now falls back to proposal scene_block_ids via buildProposalSceneIdMap; filterValidSceneIds from storyboardPipeline.repository.ts filters unknown ids; INSERT IGNORE on link inserts
