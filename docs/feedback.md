# Client Review Feedback

> Based on development log: EPIC 3 — AI Captions / Auto-Subtitles (Subtasks 1–7, all completed 2026-04-03)
> Reviewed: 2026-04-03

## Overall Impression

The core transcription flow works cleanly when everything goes right in a single session — I upload a video, click "Transcribe," wait for it to finish, and see a green "Add Captions to Timeline" button appear. That part is solid. But there are two specific points where the flow breaks down and leaves me without any feedback or recovery path, and both of them would be visible to a real first-time user.

---

## Use Cases That Don't Hold Up

### 1. Returning to an already-transcribed asset after refreshing the page

**What I was trying to do:**
I transcribed a video, added the captions to the timeline in a previous session, then came back to the editor the next day (or after the page reloaded).

**How I went through it:**
I opened the editor. My uploaded video asset shows with a green "ready" badge. I see the "Transcribe" button on the card — which makes sense visually, so I click it to try to add captions again or confirm they're there.

**Where it broke down:**
Nothing happened. No error message, no status change, nothing. The button just sat there still showing "Transcribe." I tried again — same result. I had no way to get to "Add Captions to Timeline" because the system didn't tell me what was wrong.

Behind the scenes, the API returned a 409 (already transcribed) — but that error was silently swallowed and the button did nothing. The user is completely stuck: they can't re-transcribe (it's a duplicate), and they can't reach "Add Captions to Timeline" because that requires the transcription polling path to have been triggered in this same browser session.

**Why this is a problem:**
This is a session-bound workflow in a product meant to be used across multiple sessions. The moment a user closes the tab or refreshes, they lose access to their already-completed transcription through the UI. There's no way for them to get back to the "Add Captions to Timeline" state — the data exists on the server, but the front-end has no way to discover that.

**What I need fixed:**
On initial render, the Transcribe button should check whether captions already exist for this asset (one GET call to `/assets/:id/captions`). If they do, the button should immediately start in the "ready" state showing "Add Captions to Timeline" — not "Transcribe." This means the polling hook should be enabled by default for ready video/audio assets, not only after the user triggers transcription in the current session.

---

### 2. Clicking "Add Captions to Timeline" twice creates duplicate caption tracks

**What I was trying to do:**
I clicked "Add Captions to Timeline" after transcription finished. I wasn't sure if it worked (there was no visible confirmation), so I clicked it again to be sure.

**How I went through it:**
The button showed green and said "Add Captions to Timeline." I clicked it once. Nothing visually changed — the button still showed the same label, no toast, no state change, nothing to confirm success. I clicked it a second time.

**Where it broke down:**
Each click added a brand new "Captions" track with all the same clips duplicated. My project now had two identical "Captions" tracks with every caption segment repeated twice. I didn't realize this until I looked at the video preview and saw doubled captions on top of each other.

**Why this is a problem:**
There's no success feedback and no idempotency guard on this action. Any user who is uncertain whether the action worked — which is every user, given there's no confirmation — will click again and corrupt their project. Silent duplicates in a project document are worse than a visible error.

**What I need fixed:**
After clicking "Add Captions to Timeline" successfully, the button should either:
(a) Change to a disabled/muted state with a label like "Captions added" so the user knows it worked and can't double-click it, or
(b) Be idempotent — check if a "Captions" track already exists and skip creating a second one.

Either option is fine, but some combination of visual feedback + protection against duplicate tracks is needed.

---

## What Worked Well

**The happy-path transcription flow:** From clicking "Transcribe" to seeing "Add Captions to Timeline" — when going through it fresh in one session, the state machine is clean. The idle → pending → Transcribing… → ready progression happens correctly, and the button styling communicates each state clearly (purple → grey → green).

**The backend API design:** The 409 conflict guard, 404-as-not-transcribed pattern, and the Whisper integration via the media worker are all solid choices that make sense as a foundation. The idempotency via `INSERT IGNORE` in the worker is a good call.

**Asset card layout:** The "Transcribe" button appearing only on video/audio assets that are ready is exactly right — images don't show it, and pending/processing assets don't show it either.

**Caption Editor Panel (implementation):** The panel itself is well-designed — text, start/end frame, font size, color, and position all editable. I couldn't reach it through the current UI (the timeline isn't built yet, so there's no way to select a clip), but I understand that's expected — it's wired up and ready to go once the timeline editor ships.

---

## Not Asking For (Out of Scope)

I'm deliberately not asking for a timeline UI — I know that's a separate epic and not part of what was promised here. The fact that the caption editor can't be accessed yet is expected. Similarly, not asking for autosave or session persistence of the project document — I know that's planned separately.
