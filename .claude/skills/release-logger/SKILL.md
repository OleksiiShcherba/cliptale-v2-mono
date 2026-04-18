---
name: release-logger
description: >
  Use this skill whenever the user wants to compact the development log for token efficiency while keeping a single uncompacted backup for the current batch. Trigger on phrases like "process dev logs", "compact development logs", "summarize what was done", "log the release", "clean up dev logs", "archive the dev log", "make the logs smaller", or "prepare logs for release". Always use this skill when ./docs/development-logs.md is mentioned alongside any intent to process, compact, or release.
---

# Release Logger Skill

Processes `./docs/development-logs.md` to:
1. **Overwrite** `./docs/lust-not-compacted-dev-logs.md` with the current full, uncompacted dev log (single-copy backup — no history)
2. **Compact the development log in place** — rewriting it to a dense, token-efficient summary that still communicates clearly what was done

---

## Step 1 — Read the Development Log

Resolve the dev log path — accept both naming variants:

```bash
if [ -f ./docs/development-logs.md ]; then
  DEV_LOG=./docs/development-logs.md
elif [ -f ./docs/development_logs.md ]; then
  DEV_LOG=./docs/development_logs.md
else
  DEV_LOG=""
fi
```

If neither file exists, stop and tell the user:
> Neither `./docs/development-logs.md` nor `./docs/development_logs.md` was found. Please create the file first or check the path.

Use `$DEV_LOG` in place of the hardcoded path for all subsequent steps.

---

## Step 2 — Overwrite the Uncompacted Backup

Overwrite `./docs/lust-not-compacted-dev-logs.md` with the **full, unmodified** content of `$DEV_LOG`. This is a single-copy backup, **not a history file** — previous content is discarded every run. That is intentional: we keep exactly one uncompacted copy so context never grows unbounded.

Use the Write tool (or the shell pattern below) to overwrite:

```bash
mkdir -p ./docs
cp "$DEV_LOG" ./docs/lust-not-compacted-dev-logs.md
```

Confirm to the user: ✅ `./docs/lust-not-compacted-dev-logs.md` refreshed with the current uncompacted dev log (previous copy overwritten).

---

## Step 3 — Compact the Development Log

Read the existing `$DEV_LOG` and produce a **compacted rewrite** following these rules:

### Compaction Rules

| Goal | How |
|------|-----|
| Token efficiency | Remove filler prose, verbose explanations, repeated context |
| Clarity | Keep every distinct action, file touched, decision made |
| Structure | Group by feature/component, not by time |
| Format | Bullet-point lists, no paragraphs |
| Length target | Aim for 20–40% of original token count |

### Compaction Format

```markdown
# Development Log (compacted — {original date range})

## {Feature / Component Name}
- {action}: {file or area} — {key detail}
- {action}: {file or area} — {key detail}

## {Next Feature / Component}
- ...

## Known Issues / TODOs
- ...
```

**Actions vocabulary** (use short verbs): `added`, `fixed`, `refactored`, `removed`, `updated`, `migrated`, `integrated`, `configured`, `tested`, `documented`

### What to KEEP
- Every file that was created, modified, or deleted
- Every bug that was fixed (one line: what broke → what fixed it)
- Every new feature or capability added
- Every external dependency added/removed
- Architecture decisions (one line each)
- Remaining TODOs or known issues

### What to REMOVE
- Timestamps and session markers (the uncompacted backup retains them)
- Reasoning and exploratory notes
- Duplicate mentions of the same change
- Implementation details that don't affect future work
- Praise/commentary ("great progress", "successfully completed")

---

## Step 4 — Write Back the Compacted Log

Overwrite `$DEV_LOG` with the compacted version using the Write tool.

Confirm to the user: ✅ `$DEV_LOG` compacted (from ~X lines to ~Y lines).

---

## Step 5 — Report to User

Print a short summary:

```
✅ Release Logger complete

📦 lust-not-compacted-dev-logs.md — overwritten with current full dev log
🗜️  development-logs.md — compacted: {original_lines} → {new_lines} lines ({reduction}% reduction)
```

If the user wants to review the compacted version before it's written back, show them the diff first and ask for confirmation.

---

## Edge Cases

- **Empty development log**: Warn the user and skip — nothing to process.
- **lust-not-compacted-dev-logs.md doesn't exist**: Create it fresh (the copy/Write operation handles this).
- **Very short dev log (<20 lines)**: Still compact, but note that further reduction may be minimal.
- **Multiple sessions in dev log**: Group all actions by component regardless of session boundaries.
