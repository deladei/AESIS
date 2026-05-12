import { Request } from 'express';
import { JwtPayload } from '../../middleware/authenticate';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export type RiskTier = 'low' | 'medium' | 'high';
export type PlacementStatus = 'pending' | 'active' | 'completed' | 'withdrawn' | 'failed';
export type SubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'flagged';
export type AiAnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PaginationQuery {
  page?: number;
  limit?: number;
}
