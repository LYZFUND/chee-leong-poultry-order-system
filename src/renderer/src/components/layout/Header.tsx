import { LogOut, RotateCcw, UserCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { useAuth } from '@renderer/context/AuthContext';
import { useZoom } from '@renderer/context/ZoomContext';
import { formatBusinessDate, toDateInputValue } from '@renderer/utils/date';

export function Header(): JSX.Element {
  const { user, logout } = useAuth();
  const { zoom, zoomIn, zoomOut, resetZoom } = useZoom();

  return (
    <header className="flex h-16 items-center justify-between border-b border-stone-200 bg-white px-6">
      <div>
        <p className="text-sm font-semibold text-ink-900">Today</p>
        <p className="text-xs text-ink-500">{formatBusinessDate(toDateInputValue())}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1 rounded-md border border-stone-200 bg-stone-50 p-1 md:flex">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-700 transition hover:bg-white"
            onClick={zoomOut}
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="min-w-12 text-center text-xs font-semibold text-ink-600">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-700 transition hover:bg-white"
            onClick={zoomIn}
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-700 transition hover:bg-white"
            onClick={resetZoom}
            title="Reset zoom"
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="hidden items-center gap-2 text-sm text-ink-700 sm:flex">
          <UserCircle size={18} aria-hidden="true" />
          <span>{user?.email ?? 'Signed in'}</span>
        </div>
        <Button variant="secondary" onClick={() => void logout()}>
          <LogOut size={16} />
          Sign Out
        </Button>
      </div>
    </header>
  );
}
