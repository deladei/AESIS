import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ResourceCategory =
  | 'guideline' | 'template' | 'rubric' | 'policy' | 'form' | 'sample' | 'other';

export type ResourceAudience =
  | 'student' | 'academic_supervisor' | 'company_supervisor' | 'coordinator' | 'hod' | 'admin';

export interface Resource {
  id:          string;
  title:       string;
  description: string | null;
  /** Written guidance published on its own — a resource need not point anywhere. */
  body:        string | null;
  category:    ResourceCategory;
  fileUrl:     string | null;
  externalUrl: string | null;
  mimeType:    string | null;
  fileSize:    number | null;
  sortOrder:   number;
  isPublished: boolean;
  createdAt:   string;
  /** Curator view only (`/resources/manage`) — who the card reaches. */
  audienceRoles?: ResourceAudience[];
  updatedAt?:  string;
}

/** The shelf, already filtered server-side to this role's audience. */
export function useResources() {
  return useQuery({
    queryKey: ['resources'],
    queryFn: async () => (await api.get<{ data: Resource[] }>('/resources')).data.data,
  });
}

/**
 * The curator's shelf: every live resource whoever it is for, published or not.
 * The reader's list is filtered to the reader's own role, so an admin posting
 * to students would otherwise never see what they had just published.
 */
export function useManagedResources(enabled = true) {
  return useQuery({
    queryKey: ['resources', 'manage'],
    enabled,
    queryFn: async () => (await api.get<{ data: Resource[] }>('/resources/manage')).data.data,
  });
}

export interface NewResource {
  title:         string;
  description?:  string;
  body?:         string;
  category:      ResourceCategory;
  externalUrl?:  string;
  audienceRoles: ResourceAudience[];
  isPublished:   boolean;
}

function useShelfInvalidation() {
  const qc = useQueryClient();
  // Both lists: the curator's and whatever shelf the actor reads themselves.
  return () => { qc.invalidateQueries({ queryKey: ['resources'] }); };
}

export function useCreateResource() {
  const invalidate = useShelfInvalidation();
  return useMutation({
    mutationFn: async (input: NewResource) =>
      (await api.post<{ data: Resource }>('/resources', input)).data.data,
    onSuccess: invalidate,
  });
}

export function useUploadResource() {
  const invalidate = useShelfInvalidation();
  return useMutation({
    mutationFn: async ({ file, ...input }: NewResource & { file: File }) => {
      const body = new FormData();
      body.append('file', file);
      body.append('title', input.title);
      body.append('category', input.category);
      body.append('isPublished', String(input.isPublished));
      body.append('audienceRoles', JSON.stringify(input.audienceRoles));
      if (input.description) body.append('description', input.description);
      if (input.body) body.append('body', input.body);
      if (input.externalUrl) body.append('externalUrl', input.externalUrl);
      const r = await api.post<{ data: Resource }>('/resources/upload', body, {
        headers: { 'Content-Type': undefined },
      });
      return r.data.data;
    },
    onSuccess: invalidate,
  });
}

/** Take a card off the shelf, or put it back, without archiving it. */
export function useSetResourcePublished() {
  const invalidate = useShelfInvalidation();
  return useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      (await api.patch<{ data: Resource }>(`/resources/${id}/publish`, { isPublished })).data.data,
    onSuccess: invalidate,
  });
}

export function useArchiveResource() {
  const invalidate = useShelfInvalidation();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/resources/${id}`)).data,
    onSuccess: invalidate,
  });
}

/** "2.4 MB" — bytes are not a unit anyone reads off a dashboard. */
export function formatFileSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}
