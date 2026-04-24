---
name: Token logging in stub services
description: Stub email/notification services must not log raw token values even as stubs — Section 11 security violation
type: project
---

Stub service files (like `email.service.ts`) that log to console as placeholders for real providers must not include raw secret token values in their log output. Even though the stub is temporary, logging the raw token violates Section 11 ("NEVER log a secret, token, or full connection string").

Flagged in Epic 8 subtask 4 review (2026-04-07): `sendPasswordResetEmail` and `sendEmailVerificationEmail` in `email.service.ts` logged `token=${resetToken}` and `token=${verificationToken}` respectively. Fix applied and verified 2026-04-07: token parameters renamed to `_resetToken` / `_verificationToken` (underscore prefix = intentionally unused); log messages now emit only the email address.

**Why:** Section 11 is unconditional — it applies to stub code and production code alike. The "stub" label does not exempt a file from security rules.

**How to apply:** In any stub service that receives a token parameter, flag console.log/console.error calls that include the token value as a Section 11 violation. Correct pattern: log only non-sensitive identifiers (e.g. the email address).
