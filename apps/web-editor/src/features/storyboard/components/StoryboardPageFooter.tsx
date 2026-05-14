import React from 'react';

import { storyboardPageStyles as s } from './storyboardPageStyles';

interface StoryboardPageFooterProps {
  isPlanBlocking: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function StoryboardPageFooter({
  isPlanBlocking,
  onBack,
  onNext,
}: StoryboardPageFooterProps): React.ReactElement {
  return (
    <footer style={s.bottomBar}>
      <button type="button" style={s.backButton} onClick={onBack} aria-label="Back to Step 1" data-testid="back-button">
        ← Back
      </button>
      <span style={s.bottomBarLabel} data-testid="step-label">STEP 2: STORYBOARD</span>
      <button
        type="button"
        style={isPlanBlocking ? s.nextButtonDisabled : s.nextButton}
        onClick={onNext}
        disabled={isPlanBlocking}
        aria-disabled={isPlanBlocking}
        aria-label="Next: Step 3"
        data-testid="next-step3-button"
      >
        Next: Step 3 →
      </button>
    </footer>
  );
}
