# Code Quality Expert — Memory Index

- [CaptionSegment type placement ruling](project_caption_segment_type_placement.md) — CaptionSegment defined in repository, flagged as warning; domain types belong in service layer or project-schema
- [S3 presigning controller violation resolved](project_controller_s3_presign_violation.md) — violation fully fixed 2026-04-05; all S3 logic in service; new service fns lack unit tests (warning filed)
- [find* vs get* in repositories](project_find_vs_get_naming.md) — repository getters must use `get` prefix not `find`; codebase and Section 9 convention; flagged Epic 8 subtask 2
- [Zod request-body schema placement](project_zod_schema_placement.md) — Zod validation schemas must not be defined in controller files; Section 11 requires them in validate.middleware.ts or packages/project-schema; flagged Epic 8 subtask 3
- [Token logging in stub services](project_stub_token_logging.md) — Stub email/notification services must not log raw token values; Section 11 security violation regardless of stub status; flagged Epic 8 subtask 4
