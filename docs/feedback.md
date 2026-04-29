# Client Feedback Inbox

This file is the canonical inbox for raw client/user feedback before triage.

**Workflow:**
1. New feedback (Telegram, calls, in-product reports, etc.) is appended to the "New client feedback" section below as a bullet — date + source + raw quote/summary.
2. The `feedback-triage` skill reads this file, decides what is valid / in-scope / urgent, and writes actionable items into `docs/active_task.md`.
3. Triaged items are **removed** from this file once they are queued for planning, so this file always reflects only un-triaged entries.

**Bullet format:**
```
- YYYY-MM-DD · <source> · <raw client text or one-line summary>
```

Sources: `telegram`, `email`, `call`, `support`, `ux-test`, `internal`, etc.

---

## New client feedback

<!-- Append new entries below this line. Empty section = nothing to triage. -->
