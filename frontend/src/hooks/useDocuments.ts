import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** What the API accepts. Mirrors the multer filter on the upload route. */
export const DOCUMENT_ACCEPT = 'application/pdf,image/png,image/jpeg';
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const DOC_TYPES = [
  { value: 'placement_letter',  label: 'Placement letter' },
  { value: 'acceptance_letter', label: 'Acceptance letter' },
  { value: 'final_report',      label: 'Final report' },
] as const;

/**
 * Upload a document against a placement.
 *
 * There was no upload mutation at all on the frontend: the endpoint existed,
 * wrote a `local://` placeholder, and nothing in the SPA ever called it. The
 * `Content-Type: undefined` is deliberate — it makes the browser set the
 * multipart boundary itself, the same trick `useUploadAttachment` uses.
 */
export function useUploadDocument(placementId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, docType }: { file: File; docType: string }) => {
      const body = new FormData();
      body.append('file', file);
      body.append('docType', docType);
      const r = await api.post<{ data: PlacementDocument }>(
        `/placements/${placementId}/documents`,
        body,
        { headers: { 'Content-Type': undefined } },
      );
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', placementId] }),
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
