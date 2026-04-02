/**
 * Formats a frame number as `HH:MM:SS:FF` where FF is the sub-second frame
 * index within the current second (0 to fps-1).
 */
export function formatTimecode(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const ff = frame % fps;
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  return [
    String(hh).padStart(2, '0'),
    String(mm).padStart(2, '0'),
    String(ss).padStart(2, '0'),
    String(ff).padStart(2, '0'),
  ].join(':');
}
