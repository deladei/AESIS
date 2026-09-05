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
  completedAt: string | null;
  sourceType:  string | null;
  sourceId:    string | null;
  createdAt:   string;
  createdBy:   { id: string; firstName: string; lastName: string };
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
      title: string; category?: TaskCategory; dueAt?: string;
      description?: string; placementId?: string; assigneeId?: string;
    }) => (await api.post<{ data: Task }>('/tasks', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; status?: TaskStatus; title?: string; dueAt?: string | null }) =>
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
