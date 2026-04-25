import { useState, useEffect } from 'react';

/**
 * Returns the current inner width of the browser window.
 * Updates on every resize event using a debounce-free listener.
 *
 * Used to switch between desktop (≥768px) and tablet/mobile (<768px)
 * editor layouts without CSS media queries (which are incompatible with
 * inline React styles).
 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState<number>(() => window.innerWidth);

  useEffect(() => {
    const handler = (): void => {
      setWidth(window.innerWidth);
    };

    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('resize', handler);
    };
  }, []);

  return width;
}
