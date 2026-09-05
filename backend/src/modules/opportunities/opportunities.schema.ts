import { z } from 'zod';
import { REGION_VALUES } from '../../shared/constants/regions';

export const applicationStatus = z.enum([
  'pending', 'under_review', 'shortlisted', 'offered', 'accepted', 'rejected', 'withdrawn',
]);

export const createOpportunitySchema = z.object({
  companyId:        z.string().uuid(),
  academicYearId:   z.string().uuid(),
  title:            z.string().trim().min(3).max(200),
  description:      z.string().trim().min(10).max(5000),
  responsibilities: z.string().trim().max(5000).optional(),
  requiredSkills:   z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  region:           z.enum(REGION_VALUES).optional(),
  location:         z.string().trim().max(200).optional(),
  slots:            z.coerce.number().int().min(1).max(500).default(1),
  minAcademicLevel: z.coerce.number().int().min(100).max(600).optional(),
  opensAt:          z.string().datetime().optional(),
  closesAt:         z.string().datetime().optional(),
});

export const applySchema = z.object({
  statement:    z.string().trim().max(3000).optional(),
  cvDocumentId: z.string().uuid().optional(),
});

export const decideApplicationSchema = z.object({
  status: applicationStatus,
  note:   z.string().trim().max(1000).optional(),
});
