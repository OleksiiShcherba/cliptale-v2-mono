/**
 * Formats a Date as a human-readable relative time string.
 * Examples: "3s ago", "2m ago", "1h ago"
 *
 * The absolute timestamp is best surfaced via an HTML `title` attribute or
 * tooltip so users can see the ISO string on hover.
 */
export function formatRelativeDate(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}
