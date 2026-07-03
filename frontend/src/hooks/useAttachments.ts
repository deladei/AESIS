import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Image/document evidence attached to one working DAY of a logbook entry.
// Mirrors the backend modules/entries/attachments path. Writes are only
// accepted while that day is still editable — the API enforces it; the UI
// hides the controls otherwise. `dayDate` is null on files uploaded before
// day scoping existed (legacy week-level evidence).
export type AttachmentKind = 'image' | 'document';

export interface EntryAttachment {
  id:         string;
  dayDate:    string | null; // ISO; slice to YYYY-MM-DD
  fileUrl:    string;
  fileName:   string;
  fileSize:   number;
  mimeType:   string;
  kind:       AttachmentKind;
  uploadedAt: string;
}

export function useEntryAttachments(entryId?: string) {
  return useQuery({
    queryKey: ['entry-attachments', entryId],
    enabled:  !!entryId,
    queryFn: async () => {
      const r = await api.get<{ data: EntryAttachment[] }>(`/entries/${entryId}/attachments`);
      return r.data.data;
    },
  });
}

export function useUploadAttachment(entryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, date }: { file: File; date?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (date) form.append('date', date);
      // Content-Type undefined lets the browser set the multipart boundary; the
      // axios default 'application/json' would otherwise break multer parsing.
      const r = await api.post<{ data: EntryAttachment }>(
        `/entries/${entryId}/attachments`,
        form,
        { headers: { 'Content-Type': undefined } },
      );
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entry-attachments', entryId] }),
  });
}

export function useDeleteAttachment(entryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      await api.delete(`/entries/${entryId}/attachments/${attachmentId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entry-attachments', entryId] }),
  });
}
