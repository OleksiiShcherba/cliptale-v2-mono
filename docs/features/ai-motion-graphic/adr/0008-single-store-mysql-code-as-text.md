---
status: Accepted
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-17"
feature_size: "L"
ticket: "ai-motion-graphic"
---

# 0008 — Store Motion Graphic code as a TEXT column in MySQL, version-capable from day one

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Architect + Tech Lead (Socratic design walk)

## Context

A Motion Graphic carries component code + a props schema + duration + fps + dimensions + status + chat history, and is attachable to a storyboard block as a snapshot of code+duration (CONTEXT glossary). The repo stores records in MySQL (raw `mysql2`) and binary media in S3. We must decide where the component code physically lives, given it is short text source (not a binary blob) that is read with the record and snapshotted on attach.

## Decision drivers

- The code is small text, queried together with the graphic record and snapshotted in place at attach time (AC-04, AC-10).
- Forward-compat: a typed props schema (shape only, MVP1) and a version-capable shape must be in the model from day one so MVP2/MVP3 add parameterization + version-pinning additively, not by rewrite (spec §2 goal 3).
- The deferred server-side render must later read the code — simplest from the DB.

## Considered options

1. **MySQL single-store, code as TEXT** — code in a TEXT column on the graphic row; props schema as JSON; version-capable shape from day one. A `motion_graphic` kind on the storyboard block-media pivot makes it a media asset whose content is code-in-DB.
2. **Code as an S3 blob** — metadata in MySQL, code as an S3 object like other media files.

## Decision outcome

**Chosen:** Option 1. The code is short, textual, queried with the record, and snapshotted in place — a TEXT column is the natural fit and keeps snapshot-on-attach a same-row copy rather than a second object lifecycle. S3 would make graphics uniform with binary media but adds a round trip on every read/preview and complicates the snapshot. The graphic remains a first-class media asset via the new `motion_graphic` block-media kind; "code-backed" simply means its content is DB text, not an S3 file. Detailed schema (table names, columns, indexes) is `data-model`'s job.

## Consequences

**Positive**
- Single round trip to read a graphic + its code; snapshot-on-attach is an in-row copy.
- Version-capable + props-schema-JSON shape laid in from day one — additive evolution for MVP2/MVP3.

**Negative**
- Large code payloads sit in MySQL rows (acceptable for short component source; not for arbitrary assets).
- Diverges from the "all media in S3" mental model — code-backed media is the deliberate exception.

**Neutral**
- The future server-side render reads code from the DB; if code size ever grows pathological, moving to S3 is a contained migration.

## Links

- Spec: [[../spec.md]] §2, §5 (AC-04, AC-10)
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0004-transpile-in-browser-and-mount-authored-component]]
