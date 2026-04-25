/**
 * Shared test fixtures for storyboard.service tests.
 *
 * Import these in storyboard.service.test.ts and
 * storyboard.service.status.test.ts to keep fixtures DRY.
 */

export const USER_A = 'user-aaa';
export const USER_B = 'user-bbb';
export const DRAFT_ID = 'draft-111';

export function makeDraft(
  userId: string,
  status: 'draft' | 'step2' | 'step3' | 'completed' = 'draft',
) {
  return {
    id: DRAFT_ID,
    userId,
    promptDoc: {},
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}
