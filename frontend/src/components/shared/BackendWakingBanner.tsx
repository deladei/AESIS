import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { onBackendWaking } from '@/lib/api';

/**
 * Fixed top banner shown while the backend (free Render dyno) is cold-starting
 * and the API layer is retrying. Keeps a slow first request reading as "waking"
 * rather than "broken". Subscribes to the api.ts waking signal.
 */
export function useBackendWaking() {
  const [waking, setWaking] = useState(false);
  useEffect(() => onBackendWaking(setWaking), []);
  return waking;
}

export function BackendWakingBanner() {
  const waking = useBackendWaking();
  if (!waking) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-[#15157d] px-4 py-2 text-sm font-medium text-white shadow-md"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      Waking the server… this can take up to a minute on first load.
    </div>
  );
}
