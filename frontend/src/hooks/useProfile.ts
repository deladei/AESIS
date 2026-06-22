import { useQuery } from '@tanstack/react-query';
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
