import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

const zoomStorageKey = 'chee-leong-app-content-zoom';
const defaultZoom = 1;
const minZoom = 0.8;
const maxZoom = 1.25;
const zoomStep = 0.05;

interface ZoomContextValue {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

const ZoomContext = createContext<ZoomContextValue | null>(null);

function clampZoom(value: number): number {
  return Math.min(Math.max(value, minZoom), maxZoom);
}

function readInitialZoom(): number {
  const stored = Number(localStorage.getItem(zoomStorageKey));
  return Number.isFinite(stored) ? clampZoom(stored) : defaultZoom;
}

export function ZoomProvider({ children }: { children: ReactNode }): JSX.Element {
  const [zoom, setZoom] = useState(readInitialZoom);

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * zoom}px`;
    localStorage.setItem(zoomStorageKey, String(zoom));
  }, [zoom]);

  const value = useMemo<ZoomContextValue>(
    () => ({
      zoom,
      zoomIn: () => setZoom((current) => clampZoom(Number((current + zoomStep).toFixed(2)))),
      zoomOut: () => setZoom((current) => clampZoom(Number((current - zoomStep).toFixed(2)))),
      resetZoom: () => setZoom(defaultZoom),
    }),
    [zoom],
  );

  return <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>;
}

export function useZoom(): ZoomContextValue {
  const context = useContext(ZoomContext);
  if (!context) {
    throw new Error('useZoom must be used inside ZoomProvider.');
  }
  return context;
}
