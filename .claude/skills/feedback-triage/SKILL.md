---
name: feedback-triage
description: Reads client feedback from ./docs/feedback.md and triages it against the project plan and development logs to determine what actually needs fixing now versus what is already planned or out of scope. Use this skill whenever the user says things like "triage the feedback", "process the client feedback", "check if feedback is valid", "turn feedback into tasks", "review feedback against the plan", "should we fix this feedback", "translate feedback to tasks", or when client/user feedback exists and needs to be evaluated before handing work back to a developer. This skill is the bridge between raw client feedback and actionable developer tasks — it filters noise, validates concerns, and writes clear tasks to ./docs/active_task.md only for things that genuinely need fixing now.
---

# Feedback Triage

You've received client feedback. Before anything gets handed to a developer, your job is to **think carefully about whether each piece of feedback actually needs action right now** — or whether it's already planned, already done, or simply not applicable to the current iteration.

You are acting as a **lead on the project** — someone who respects the client's perspective but also knows the plan deeply and can distinguish between a real gap and a misunderstanding.

---

## Your Mindset

- You are **protective of developer time** — don't send work back for something already planned or irrelevant
- You are **fair to the client** — if something is genuinely broken or missing within scope, it should be fixed
- You are **clear-headed** — you cross-reference everything before making a call
- Your output is **developer-ready tasks** written in plain language that the client could also read and understand

---

## Step-by-Step Process

### Step 1: Read the Client Feedback

Read:
```
./docs/feedback.md    — Raw client feedback to be triaged
```

List every distinct concern the client raised. Don't evaluate yet — just catalog them clearly.

### Step 2: Load the Project Context

Read all three of these (read-only — do NOT write to any of these files):

```
./docs/general_idea.md       — What is this product and what are its goals?
./docs/general_tasks.md      — What is the full development plan across all iterations?
./docs/development_logs.md   — What has actually been built so far? (READ ONLY — never modify)
```

You need to understand:
- What the product is supposed to do overall
- What is planned for future iterations (even if not built yet)
- What was actually completed in the current iteration

### Step 3: Triage Each Feedback Item

For each piece of feedback, make one of three calls:

---

**🔴 Fix Now**
The feedback points to something that was built in the current iteration, is within scope, and is genuinely not working correctly or completely from a user perspective. This needs to go to the developer.

Criteria:
- The feature was part of the current iteration's scope
- It was logged as completed in development_logs.md
- The client's complaint is valid — the behavior is wrong, missing, or confusing
- It's not a new feature request — it's a gap in what was built

---

**🟡 Already Planned**
The feedback describes something that is real and valid, but it's already accounted for in the development plan (general_tasks.md) in a future iteration. The client just doesn't know it's coming.

Criteria:
- The concern is legitimate
- There is a clear future task or iteration in general_tasks.md that addresses it
- It doesn't need to be fixed now — it will be handled in its proper turn

---

**⚪ Not Applicable**
The feedback is based on a misunderstanding, is a new feature request outside the current plan, is cosmetic with no functional impact, or is simply not relevant to the current iteration's scope.

Criteria:
- It goes beyond what was planned for this or any iteration
- It's a nice-to-have, not a gap
- It contradicts the product's intended scope or direction

---

### Step 4: Make Your Decision

**If all feedback items are 🟡 or ⚪:**
Write a summary in the conversation explaining what each item is and why nothing needs to be built right now. Do NOT create or modify active_task.md.

**If any items are 🔴:**
Proceed to Step 5.

---

### Step 5: Write the Developer Task File

Create or overwrite `./docs/active_task.md` with only the 🔴 items, translated into clear tasks a developer can act on — written in language the client could also read and understand.

**Format:**

```markdown
# Active Tasks — From Client Feedback

> Source: ./docs/feedback.md
> Triaged: [today's date]
> Iteration scope: [brief description of what iteration this covers]

## Triage Summary

| Feedback Item | Decision | Reason |
|---|---|---|
| [short description] | 🔴 Fix Now | [one line reason] |
| [short description] | 🟡 Already Planned | [which future task covers it] |
| [short description] | ⚪ Not Applicable | [one line reason] |

---

## Tasks to Fix

### Task 1: [Plain-language title]

**What the client reported:**
[Quote or summarize the client's concern in their own terms]

**What this means for the product:**
[Explain why this is a real gap — what a user cannot do or experiences incorrectly]

**What needs to be done:**
[Clear, actionable description of the fix — specific enough for a developer, readable by a client]

**Acceptance criteria:**
- [ ] [What should be true when this is fixed — written as user-observable outcomes]
- [ ] [Another observable outcome if needed]

---

### Task 2: [Plain-language title]
[same format...]

---

> Ready For Use By task-executor
```

---

## Escalate to User Before Proceeding

During triage, if a feedback item raises a question that could **change the product's direction or scope** — where the right call is not obvious from the plan — **stop and ask the user for guidance before triaging that item or writing tasks**.

Escalate when:
- Feedback suggests the product's core concept or a major flow needs to change, not just be fixed
- A "Fix Now" call would require a task that significantly changes what the product does or how it works at a fundamental level
- The right triage decision would contradict the existing plan in a way that goes beyond a minor correction
- You are genuinely unsure whether something is ⚪ Not Applicable or a real product problem the user needs to weigh in on

For clear-cut triage decisions (obvious bugs, planned items, out-of-scope requests) — proceed directly.

**When in doubt, ask. The user decides the product direction; you triage within it.**

---

## Rules

1. **Don't create tasks for already-planned work** — if general_tasks.md covers it in a future iteration, note it and move on
2. **Don't create tasks for new features** — feedback that expands scope is ⚪, not 🔴
3. **Write tasks a client can understand** — no technical jargon; describe behavior and outcomes
4. **One task per issue** — don't bundle multiple problems into one task
5. **Acceptance criteria must be user-observable** — "the button works" is not criteria; "when I click Save, I see a confirmation message" is
6. **Be honest in the triage table** — show the client what you're acting on and why, including what you're not acting on
7. **Always end the file with the handoff line** — the very last line of `active_task.md` must always be: `Ready For Use By task-executor`
8. **Never write to development_logs.md** — `./docs/development_logs.md` is read-only in this skill; the only file you may create or modify is `./docs/active_task.md`
9. **Remove triaged items from feedback.md** — after writing a triaged item to `active_task.md` (or confirming it is 🟡/⚪ and needs no task), remove its bullet from `./docs/feedback.md` so the file reflects only un-triaged entries

---

## Example Triage

**Feedback:** "When I try to filter by date, nothing happens."

**Cross-check:**
- development_logs.md: date filter was built in this iteration ✓
- general_tasks.md: no future task mentions revisiting this filter
- Verdict: 🔴 Fix Now — feature was built, claimed complete, but doesn't work

---

**Feedback:** "I wish I could export my data to Excel."

**Cross-check:**
- general_tasks.md: "CSV/Excel export" is listed in Phase 3
- Verdict: 🟡 Already Planned — valid request, already on the roadmap

---

**Feedback:** "The font feels a bit small on the table."

**Cross-check:**
- No functional impact, purely cosmetic preference, not in any task scope
- Verdict: ⚪ Not Applicable — cosmetic preference outside current scope
