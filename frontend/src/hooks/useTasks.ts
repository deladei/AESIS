import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TaskCategory = 'report' | 'review' | 'admin' | 'meeting' | 'other';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export interface Task {
  id:          string;
  title:       string;
  description: string | null;
  category:    TaskCategory;
  status:      TaskStatus;
  dueAt:       string | null;
  /** Minutes the student expects it to take; null = open-ended. */
  durationMinutes: number | null;
  completedAt: string | null;
  sourceType:  string | null;
  sourceId:    string | null;
  createdAt:   string;
  createdBy:   { id: string; firstName: string; lastName: string };
  /** Briefs or templates the supervisor attached when setting the work. */
  attachments: TaskAttachment[];
}

export interface TaskAttachment {
  id:       string;
  fileUrl:  string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  kind:     'image' | 'document';
}

export interface TaskList {
  tasks: Task[];
  /** Counted server-side from real rows — never a stored counter. */
  progress: { done: number; total: number };
}

const KEY = ['tasks'] as const;

export function useTasks(placementId?: string) {
  return useQuery({
    queryKey: [...KEY, placementId ?? 'all'],
    queryFn: async () => {
      const qs = placementId ? `?placementId=${placementId}` : '';
      const r = await api.get<{ data: TaskList }>(`/tasks${qs}`);
      return r.data.data;
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string; category?: TaskCategory; dueAt?: string; durationMinutes?: number;
      description?: string; placementId?: string; assigneeId?: string;
    }) => (await api.post<{ data: Task }>('/tasks', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: {
      id: string; status?: TaskStatus; title?: string;
      dueAt?: string | null; durationMinutes?: number | null;
    }) =>
      (await api.patch<{ data: Task }>(`/tasks/${id}`, patch)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/tasks/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface AssignWorkInput {
  assigneeIds: string[];
  title:       string;
  description?: string;
  category?:   TaskCategory;
  /** ISO instant. The form collects a date AND a time — a deadline has both. */
  dueAt?:      string;
  durationMinutes?: number;
  files?:      File[];
}

/**
 * Set one piece of work for a group of supervised students.
 *
 * Multipart because the brief travels with the assignment. The files are
 * uploaded once server-side and shared across every task created, so setting
 * the same PDF for fifteen students costs one upload rather than fifteen.
 *
 * The instance default of application/json has to be overridden, exactly as
 * the avatar upload does, so axios computes the multipart boundary itself —
 * otherwise multer cannot parse the upload.
 */
export function useAssignWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignWorkInput) => {
      const form = new FormData();
      form.append('assigneeIds', JSON.stringify(input.assigneeIds));
      form.append('title', input.title);
      if (input.description)     form.append('description', input.description);
      if (input.category)        form.append('category', input.category);
      if (input.dueAt)           form.append('dueAt', input.dueAt);
      if (input.durationMinutes) form.append('durationMinutes', String(input.durationMinutes));
      for (const f of input.files ?? []) form.append('files', f);

      const r = await api.post<{ data: { created: number } }>('/tasks/assign', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
