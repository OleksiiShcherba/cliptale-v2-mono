/**
 * MotionGraphicAuthoringView — the authoring view (T16 / AC-01, AC-02, AC-05, AC-06).
 *
 * The first half of the authoring loop (sad.md §6 flow 1): describe → cost-confirm →
 * stream → preview → persist a NEW graphic. Layout (AC-02):
 *   - the animation-duration (seconds) input ABOVE the chat,
 *   - the live preview filling the canvas area ALONGSIDE the chat.
 *
 * Generate flow on submit of a description:
 *   1. show the cost estimate + confirm (estimateGenerationCost, AC-11 — what is shown
 *      is what is sent as `acknowledgedCost`),
 *   2. on confirm, open the `POST /motion-graphics/generate` SSE stream (useGenerateStream),
 *      assembling the streamed token frames into the component source,
 *   3. run transpile + determinism (evaluateGraphic, T15) on the assembled code,
 *   4. persist the verdict via `createMotionGraphic` (POST /motion-graphics):
 *        ready  → preview refreshes + status ready, auto-title sized to duration (AC-01),
 *        failed → record the error in chat, no broken preview (AC-06).
 *
 * The too-short / cost / guardrail pre-stream 422 surfaces inline from the thrown
 * GenerateStreamError (AC-05).
 *
 * REFINE (sending follow-ups in the chat) is T17 — the chat panel below is the seam
 * it plugs into; this view only implements GENERATE + create-persist.
 */

import React, { useMemo, useState } from 'react';

import { createMotionGraphic } from '../api';
import { estimateGenerationCost } from '../cost';
import { useGenerateStream } from '../hooks/useGenerateStream';
import { evaluateGraphic } from '../runtime/evaluateGraphic';
import { MotionGraphicPlayer } from '../runtime/MotionGraphicPlayer';
import type { ChatTurn, MotionGraphic, Money } from '../types';
import { authoringViewStyles as styles } from './motionGraphicAuthoringView.styles';

const DEFAULT_DURATION_SECONDS = 5;
const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

/** Local chat entry (pre-persist view state; T17 will hydrate from server turns). */
type ChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** assistant verdict, when recorded. */
  outcome?: 'ready' | 'failed';
};

/** Derive an auto-title sized to the chosen duration (AC-01; the Creator may rename). */
function autoTitle(durationSeconds: number): string {
  return `Motion Graphic (${durationSeconds}s)`;
}

let entryCounter = 0;
function nextId(): string {
  entryCounter += 1;
  return `entry-${entryCounter}`;
}

export function MotionGraphicAuthoringView(): React.ReactElement {
  const { runGenerate } = useGenerateStream();

  const [durationSeconds, setDurationSeconds] = useState<number>(DEFAULT_DURATION_SECONDS);
  const [description, setDescription] = useState('');
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [readyCode, setReadyCode] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pendingEstimate, setPendingEstimate] = useState<Money | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const geometry = useMemo(
    () => ({ durationSeconds, fps: DEFAULT_FPS, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }),
    [durationSeconds],
  );

  function handleSubmit(): void {
    setInlineError(null);
    const prompt = description.trim();
    // Open the cost gate showing the estimate that will be sent as acknowledgedCost.
    setPendingPrompt(prompt);
    setPendingEstimate(estimateGenerationCost(durationSeconds));
  }

  function handleCancel(): void {
    setPendingEstimate(null);
    setPendingPrompt('');
  }

  async function handleConfirm(): Promise<void> {
    if (pendingEstimate == null) return;
    const prompt = pendingPrompt;
    const estimate = pendingEstimate;
    setSubmitting(true);
    setInlineError(null);

    let assembled: string;
    try {
      assembled = await runGenerate({
        prompt,
        durationSeconds,
        acknowledgedCost: estimate,
      });
    } catch (err) {
      // Pre-stream gate (AC-05 too-short / AC-11 cost / guardrail) or stream error:
      // surface the plain-language message inline; do NOT persist.
      const message =
        err instanceof Error ? err.message : 'Generation could not be started.';
      setInlineError(message);
      setSubmitting(false);
      return;
    }

    // Cost gate done — the description is now part of the chat history.
    setPendingEstimate(null);
    setPendingPrompt('');
    setDescription('');
    const userEntry: ChatEntry = { id: nextId(), role: 'user', content: prompt };
    setChat((prev) => [...prev, userEntry]);

    // Transpile + determinism verdict (T15) drives ready vs failed (AC-01/06/09).
    const verdict = evaluateGraphic(assembled);

    try {
      if (verdict.ok) {
        const created: MotionGraphic = await createMotionGraphic({
          prompt,
          durationSeconds,
          outcome: 'ready',
          code: assembled,
          fps: DEFAULT_FPS,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
        });
        setReadyCode(created.code ?? assembled);
        setChat((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content: created.title || autoTitle(durationSeconds),
            outcome: 'ready',
          },
        ]);
      } else {
        // AC-06: failed attempt — record the plain-language error in chat, keep no
        // broken preview, and persist the failed verdict.
        const reason = verdict.reason;
        await createMotionGraphic({
          prompt,
          durationSeconds,
          outcome: 'failed',
          code: null,
          errorMessage: reason,
        });
        setReadyCode(null);
        setChat((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', content: reason, outcome: 'failed' },
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the graphic.';
      setInlineError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const estimate = estimateGenerationCost(durationSeconds);

  return (
    <main style={styles.page} data-testid="motion-graphic-authoring">
      <div style={styles.workspace}>
        {/* Preview fills the canvas area alongside the chat (AC-02). */}
        <section style={styles.previewArea} data-testid="mg-authoring-preview" aria-label="Live preview">
          {readyCode ? (
            <MotionGraphicPlayer code={readyCode} geometry={geometry} />
          ) : (
            <div style={styles.previewPlaceholder}>
              Describe a motion graphic to generate a live preview.
            </div>
          )}
        </section>

        {/* Right rail: duration input ABOVE the chat (AC-02). */}
        <aside style={styles.rail}>
          <div style={styles.durationRow}>
            <label htmlFor="mg-duration" style={styles.label}>
              Animation duration (seconds)
            </label>
            <input
              id="mg-duration"
              type="number"
              min={1}
              step={0.5}
              value={durationSeconds}
              aria-label="Animation duration (seconds)"
              style={styles.durationInput}
              onChange={(e) => {
                const next = Number(e.target.value);
                setDurationSeconds(Number.isFinite(next) && next > 0 ? next : DEFAULT_DURATION_SECONDS);
              }}
            />
            <span style={styles.estimateHint} data-testid="mg-duration-estimate">
              Est. {estimate.currency} {estimate.amount.toFixed(2)}
            </span>
          </div>

          <div style={styles.chat} data-testid="mg-chat">
            <ul style={styles.chatList}>
              {chat.map((entry) => (
                <li
                  key={entry.id}
                  style={entry.role === 'assistant' ? styles.assistantTurn : styles.userTurn}
                  data-testid={
                    entry.outcome === 'failed' ? 'mg-chat-error' : `mg-chat-${entry.role}`
                  }
                >
                  {entry.content}
                </li>
              ))}
            </ul>

            {inlineError && (
              <div role="alert" style={styles.inlineError} data-testid="mg-inline-error">
                {inlineError}
              </div>
            )}

            <div style={styles.composer}>
              <textarea
                aria-label="Describe the motion graphic"
                placeholder="Describe the motion graphic you want…"
                value={description}
                style={styles.composerInput}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={styles.generateButton}
              >
                Generate
              </button>
            </div>
          </div>
        </aside>
      </div>

      {pendingEstimate && (
        <div
          style={styles.costOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mg-cost-title"
        >
          <div style={styles.costModal}>
            <h2 id="mg-cost-title" style={styles.costTitle}>
              Confirm generation
            </h2>
            <p style={styles.costSub}>This will run a paid generation. Estimated cost:</p>
            <div style={styles.costAmount} data-testid="mg-cost-amount">
              {pendingEstimate.currency} {pendingEstimate.amount.toFixed(2)}
            </div>
            <div style={styles.costActions}>
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                style={styles.cancelButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={submitting}
                style={styles.confirmButton}
              >
                {submitting ? 'Generating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Re-export the chat turn shape so T17 can extend the chat panel with refine turns.
export type { ChatTurn };
