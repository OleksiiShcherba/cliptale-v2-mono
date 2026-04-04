import type { Patch } from 'immer';

/** Minimal project document used across all useAutosave test files. */
export const FAKE_DOC = { id: 'doc-1', schemaVersion: 1 };

/** Forward patch set for testing save payloads. */
export const FAKE_PATCHES: Patch[] = [{ op: 'replace', path: ['title'], value: 'New' }];

/** Inverse patch set for testing save payloads. */
export const FAKE_INVERSE: Patch[] = [{ op: 'replace', path: ['title'], value: 'Old' }];
