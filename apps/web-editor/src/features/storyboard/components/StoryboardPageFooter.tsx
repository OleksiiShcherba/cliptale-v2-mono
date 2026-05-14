import React from 'react';

import { storyboardPageStyles as s } from './storyboardPageStyles';

interface StoryboardPageFooterProps {
  isNextDisabled: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function StoryboardPageFooter({
  isNextDisabled,
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
        style={isNextDisabled ? s.nextButtonDisabled : s.nextButton}
        onClick={onNext}
        disabled={isNextDisabled}
        aria-disabled={isNextDisabled}
        aria-label="Next: Step 3"
        data-testid="next-step3-button"
      >
        Next: Step 3 →
      </button>
    </footer>
  );
}
