import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface RecapTheme { tag: string; count: number }

export interface InternshipRecap {
  totalEntries: number;
  weeksCovered: number;
  totalWeeksInAttachment: number;
  daysOnTime: number;
  longestOnTimeStreak: number;
  /** The lateness grace the server applied (DAY_GRACE_DAYS) — never hardcode it here. */
  graceDays: number;
  themes: RecapTheme[];
  skills: string[];
  challenges: string[];
  firstEntryDate: string | null;
  lastEntryDate: string | null;
}

export interface RecapResponse {
  available: boolean;
  reason?: string;
  recap?: InternshipRecap;
}

/**
 * End-of-internship recap. Every figure is computed server-side from the
 * student's OWN logbook — no assessment, grade or enrichment data reaches this
 * endpoint (see backend recap.service.ts).
 */
export function useRecap(enabled: boolean) {
  return useQuery({
    queryKey: ['internship-recap'],
    enabled,
    retry: false,
    queryFn: async () => {
      const r = await api.get<{ data: RecapResponse }>('/student/recap');
      return r.data.data;
    },
  });
}
