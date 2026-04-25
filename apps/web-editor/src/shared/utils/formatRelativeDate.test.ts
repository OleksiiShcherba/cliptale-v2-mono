import { describe, it, expect, vi, afterEach } from 'vitest';

import { formatRelativeDate } from './formatRelativeDate';

describe('formatRelativeDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Xs ago" for dates less than 60 seconds ago', () => {
    vi.useFakeTimers();
    const date = new Date(Date.now() - 30_000);
    expect(formatRelativeDate(date)).toBe('30s ago');
  });

  it('returns "0s ago" for a date equal to now', () => {
    vi.useFakeTimers();
    const date = new Date(Date.now());
    expect(formatRelativeDate(date)).toBe('0s ago');
  });

  it('returns "59s ago" at the boundary just before 60 seconds', () => {
    vi.useFakeTimers();
    const date = new Date(Date.now() - 59_000);
    expect(formatRelativeDate(date)).toBe('59s ago');
  });

  it('returns "1m ago" for a date exactly 60 seconds ago', () => {
    vi.useFakeTimers();
    const date = new Date(Date.now() - 60_000);
    expect(formatRelativeDate(date)).toBe('1m ago');
  });

  it('returns "Xm ago" for dates between 1 and 60 minutes ago', () => {
    vi.useFakeTimers();
    const date = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeDate(date)).toBe('5m ago');
  });

  it('returns "59m ago" at the boundary just before 60 minutes', () => {
    vi.useFakeTimers();
    const date = new Date(Date.now() - 59 * 60_000);
    expect(formatRelativeDate(date)).toBe('59m ago');
  });

  it('returns "1h ago" for a date exactly 60 minutes ago', () => {
    vi.useFakeTimers();
    const date = new Date(Date.now() - 60 * 60_000);
    expect(formatRelativeDate(date)).toBe('1h ago');
  });

  it('returns "Xh ago" for dates more than 60 minutes ago', () => {
    vi.useFakeTimers();
    const date = new Date(Date.now() - 3 * 60 * 60_000);
    expect(formatRelativeDate(date)).toBe('3h ago');
  });
});
