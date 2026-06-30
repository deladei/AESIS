import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProfilePlacement {
  id:                 string;
  status:             string;
  region:             string | null;
  startDate:          string | null;
  endDate:            string | null;
  companyName:        string | null;
  companyAddress:     string | null;
  companySupervisor:  string | null;
  academicSupervisor: string | null;
}

export interface Profile {
  id:               string;
  firstName:        string;
  lastName:         string;
  email:            string;
  role:             'student' | 'academic_supervisor' | 'coordinator' | 'admin';
  avatarUrl:        string | null;
  gender:           'male' | 'female' | 'other' | null;
  indexNumber:      string | null;
  phone:            string | null;
  isVerified:       boolean;
  department:       string | null;
  programme:        string | null;
  supervisedRegion: string | null;
  createdAt:        string;
  lastLoginAt:      string | null;
  placement:        ProfilePlacement | null;
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn:  async () => {
      const r = await api.get<{ data: { profile: Profile } }>('/auth/me');
      return r.data.data.profile;
    },
  });
}

// Self-service edit (PATCH /auth/me). Only send the fields that changed; the
// backend ignores indexNumber for non-students and treats '' phone as a clear.
export interface UpdateProfileInput {
  firstName?:   string;
  lastName?:    string;
  gender?:      'male' | 'female' | 'other';
  phone?:       string;
  indexNumber?: string;
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const r = await api.patch<{ data: { profile: Profile } }>('/auth/me', input);
      return r.data.data.profile;
    },
    onSuccess: (profile) => {
      qc.setQueryData(['profile', 'me'], profile);
    },
  });
}

// Profile-picture upload (POST /auth/me/avatar, multipart). Returns the new
// avatarUrl; the caller folds it into both the cached profile and the auth
// user so the shell avatar updates immediately.
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('avatar', file);
      // Override the instance's default application/json so axios computes the
      // multipart boundary itself — otherwise multer can't parse the upload.
      const r = await api.post<{ data: { avatarUrl: string } }>('/auth/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data.data.avatarUrl;
    },
    onSuccess: (avatarUrl) => {
      qc.setQueryData<Profile>(['profile', 'me'], (prev) =>
        prev ? { ...prev, avatarUrl } : prev,
      );
    },
  });
}

export function useRemoveAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/auth/me/avatar');
      return null as string | null;
    },
    onSuccess: () => {
      qc.setQueryData<Profile>(['profile', 'me'], (prev) =>
        prev ? { ...prev, avatarUrl: null } : prev,
      );
    },
  });
}
