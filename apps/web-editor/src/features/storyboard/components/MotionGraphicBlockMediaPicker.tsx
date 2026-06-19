/**
 * MotionGraphicBlockMediaPicker — the block-media picker extension for the
 * `motion_graphic` media kind (T18 / AC-04, AC-08).
 *
 * Lists the Creator's READY Motion Graphics, and on pick freezes + attaches the
 * chosen graphic to a storyboard block via the attach endpoint
 * (POST /storyboards/:draftId/blocks/:blockId/media/motion-graphic). On success
 * it renders the returned frozen snapshot via the runtime preview
 * (MotionGraphicPlayer) so the attached graphic appears among the block media,
 * and hands the new row to the caller. A `422 motion_graphic.not_ready` surfaces
 * the server's refusal message (AC-08) — the server is the authority, but the
 * list is pre-filtered to ready graphics so the refusal is the rare race.
 *
 * The snapshot's code + duration are frozen server-side (T12); this component
 * only triggers the attach and mounts the returned snapshot — it never edits it.
 */

import React, { useEffect, useState } from 'react';

import {
  attachMotionGraphicToBlock,
  listMotionGraphics,
  AttachMotionGraphicError,
} from '@/features/motion-graphic/api';
import { MotionGraphicPlayer } from '@/features/motion-graphic/runtime';
import type {
  BlockMediaMotionGraphic,
  MotionGraphicSummary,
} from '@/features/motion-graphic/types';

import {
  BORDER,
  ERROR,
  PRIMARY,
  SURFACE,
  SURFACE_ALT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  sectionLabelStyle,
} from './SceneModal.styles';

/** AC-08 refusal copy, shown when the list went stale (server is the authority). */
const NOT_READY_FALLBACK = 'Only a ready, working graphic can be added.';

interface MotionGraphicBlockMediaPickerProps {
  draftId: string;
  blockId: string;
  /** Fired with the new block-media row once an attach succeeds (AC-04). */
  onAttached: (row: BlockMediaMotionGraphic) => void;
  onClose: () => void;
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginTop: '8px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 12px',
  background: SURFACE,
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  fontFamily: 'Inter, sans-serif',
  color: TEXT_PRIMARY,
  fontSize: '13px',
};

const badgeStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 500,
  color: PRIMARY,
  border: `1px solid ${PRIMARY}`,
  borderRadius: '4px',
  padding: '4px 8px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  flexShrink: 0,
  fontFamily: 'Inter, sans-serif',
};

const titleStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const mutedStyle: React.CSSProperties = {
  fontSize: '12px',
  color: TEXT_SECONDARY,
  padding: '8px 12px',
};

const errorBoxStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(239,68,68,0.1)',
  border: `1px solid ${ERROR}`,
  borderRadius: '8px',
  color: ERROR,
  fontSize: '12px',
  fontWeight: 400,
  marginTop: '8px',
};

const previewWrapStyle: React.CSSProperties = {
  marginTop: '8px',
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: '8px',
  overflow: 'hidden',
  border: `1px solid ${BORDER}`,
  background: SURFACE_ALT,
};

export function MotionGraphicBlockMediaPicker({
  draftId,
  blockId,
  onAttached,
  onClose,
}: MotionGraphicBlockMediaPickerProps): React.ReactElement {
  const [graphics, setGraphics] = useState<MotionGraphicSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attached, setAttached] = useState<BlockMediaMotionGraphic | null>(null);

  useEffect(() => {
    let active = true;
    listMotionGraphics()
      .then((page) => {
        if (!active) return;
        // Only ready graphics are attachable (AC-08); pre-filter so the picker
        // does not even offer not-ready graphics. The server stays the authority.
        setGraphics(page.items.filter((g) => g.status === 'ready'));
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handlePick = async (id: string): Promise<void> => {
    setRefusal(null);
    setAttaching(true);
    try {
      const row = await attachMotionGraphicToBlock(draftId, blockId, { motionGraphicId: id });
      setAttached(row);
      onAttached(row);
    } catch (err) {
      if (err instanceof AttachMotionGraphicError && err.code === 'motion_graphic.not_ready') {
        setRefusal(err.message || NOT_READY_FALLBACK);
      } else if (err instanceof AttachMotionGraphicError) {
        setRefusal(err.message);
      } else {
        setRefusal('Could not attach the Motion Graphic. Please try again.');
      }
    } finally {
      setAttaching(false);
    }
  };

  return (
    <section aria-label="Attach Motion Graphic" data-testid="motion-graphic-picker">
      <p style={sectionLabelStyle}>Motion Graphics</p>

      {refusal && (
        <div style={errorBoxStyle} role="alert" data-testid="motion-graphic-refusal">
          {refusal}
        </div>
      )}

      {attached ? (
        <div style={previewWrapStyle} data-testid="attached-motion-graphic-preview">
          <MotionGraphicPlayer
            code={attached.snapshot.code}
            geometry={{
              durationSeconds: attached.snapshot.durationSeconds,
              fps: attached.snapshot.fps,
              width: attached.snapshot.width,
              height: attached.snapshot.height,
            }}
          />
        </div>
      ) : (
        <>
          {loadError && (
            <div style={mutedStyle} role="alert">
              Could not load your Motion Graphics.
            </div>
          )}
          {!loadError && graphics === null && (
            <div style={mutedStyle}>Loading Motion Graphics…</div>
          )}
          {!loadError && graphics !== null && graphics.length === 0 && (
            <div style={mutedStyle}>You have no ready Motion Graphics yet.</div>
          )}
          {graphics !== null && graphics.length > 0 && (
            <div style={listStyle} data-testid="motion-graphic-list">
              {graphics.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  style={rowStyle}
                  disabled={attaching}
                  onClick={() => void handlePick(g.id)}
                  data-testid={`motion-graphic-option-${g.id}`}
                >
                  <span style={badgeStyle}>Motion Graphic</span>
                  <span style={titleStyle} title={g.title}>
                    {g.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        style={{
          ...rowStyle,
          marginTop: '8px',
          justifyContent: 'center',
          cursor: 'pointer',
          color: TEXT_SECONDARY,
        }}
        onClick={onClose}
        data-testid="motion-graphic-picker-close"
      >
        Close
      </button>
    </section>
  );
}
