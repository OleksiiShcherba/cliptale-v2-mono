/**
 * MotionGraphicsPage — the AI Motion Graphic surface (US-01).
 *
 * MVP scaffold: an empty page shell that the list (T13) and authoring chat
 * (T14) build on. Rendered behind a protected `/motion-graphics` route.
 */

import React from 'react';

import { motionGraphicsPageStyles as styles } from './motionGraphicsPage.styles';

export function MotionGraphicsPage(): React.ReactElement {
  return (
    <main style={styles.page} data-testid="motion-graphics-page">
      <h1 style={styles.heading}>Motion Graphics</h1>
      <p style={styles.empty} data-testid="motion-graphics-empty">
        You don&apos;t have any motion graphics yet.
      </p>
    </main>
  );
}
