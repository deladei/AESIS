import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PlacementDocument {
  id:         string;
  docType:    string;
  title:      string | null;
  fileUrl:    string;
  fileName:   string;
  fileSize:   number;
  mimeType:   string;
  uploadedAt: string;
}

/** Documents attached to a placement. Empty until something is uploaded. */
export function useDocuments(placementId: string | undefined) {
  return useQuery({
    queryKey: ['documents', placementId],
    enabled:  !!placementId,
    queryFn:  async () =>
      (await api.get<{ data: PlacementDocument[] }>(`/placements/${placementId}/documents`)).data.data,
  });
}

/** "2.4 MB" — bytes are not a unit anyone reads off a dashboard. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}
