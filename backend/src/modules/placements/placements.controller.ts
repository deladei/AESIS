import { Request, Response } from 'express';
import {
  createPlacementSchema,
  updatePlacementStatusSchema,
  createCompanySchema,
} from './placements.schema';
import * as service from './placements.service';
import { ok, created } from '../../shared/utils/response';
import { AppError } from '../../middleware/errorHandler';
import { paginationQuery, uuidParam } from '../../shared/validators/common';
import { z } from 'zod';

// ── Placements ────────────────────────────────────────────────

export async function createPlacementHandler(req: Request, res: Response) {
  const input     = createPlacementSchema.parse(req.body);
  const placement = await service.createPlacement(req.user!.sub, input);
  return created(res, placement);
}

export async function getMyPlacementsHandler(req: Request, res: Response) {
  const placements = await service.getMyPlacements(req.user!.sub);
  return ok(res, placements);
}

export async function getPlacementHandler(req: Request, res: Response) {
  const { id } = uuidParam.parse(req.params);
  const placement = await service.getPlacement(id, req.user!.sub, req.user!.role);
  return ok(res, placement);
}

export async function updatePlacementStatusHandler(req: Request, res: Response) {
  const { id }  = uuidParam.parse(req.params);
  const input   = updatePlacementStatusSchema.parse(req.body);
  const updated = await service.updatePlacementStatus(id, req.user!.sub, input);
  return ok(res, updated);
}

export async function listPlacementsHandler(req: Request, res: Response) {
  const { page, limit } = paginationQuery.parse(req.query);
  const statusFilter = z.enum(['pending', 'active', 'completed', 'withdrawn', 'failed'])
    .optional()
    .parse(req.query['status']);

  const result = await service.listPlacements({
    status: statusFilter,
    academicYearId: req.query['academicYearId'] as string | undefined,
    page,
    limit,
  });
  return ok(res, result.placements, result.meta);
}

export async function getSupervisorPlacementsHandler(req: Request, res: Response) {
  const placements = await service.getSupervisorPlacements(req.user!.sub);
  return ok(res, placements);
}

// ── Companies ─────────────────────────────────────────────────

export async function createCompanyHandler(req: Request, res: Response) {
  const input   = createCompanySchema.parse(req.body);
  const company = await service.createCompany(input);
  return created(res, company);
}

export async function listCompaniesHandler(req: Request, res: Response) {
  const { page, limit } = paginationQuery.parse(req.query);
  const result = await service.listCompanies(page, limit);
  return ok(res, result.companies, result.meta);
}

export async function getCompanyAnalyticsHandler(req: Request, res: Response) {
  const { id } = uuidParam.parse(req.params);
  const analytics = await service.getCompanyAnalytics(id);
  return ok(res, analytics);
}

// ── Documents ─────────────────────────────────────────────────

export async function uploadDocumentHandler(req: Request, res: Response) {
  const { id } = uuidParam.parse(req.params);

  // Multer populates req.file — handle missing file
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new AppError(400, 'No file uploaded');

  const docType = z.enum(['placement_letter', 'acceptance_letter', 'final_report'])
    .parse(req.body['docType']);

  // In dev without S3 configured, use a local placeholder URL
  const fileUrl = (file as Express.Multer.File & { location?: string }).location
    ?? `local://${file.originalname}`;

  const doc = await service.addPlacementDocument(
    id,
    req.user!.sub,
    { url: fileUrl, name: file.originalname, size: file.size, mimeType: file.mimetype },
    docType,
  );
  return created(res, doc);
}

export async function listDocumentsHandler(req: Request, res: Response) {
  const { id }  = uuidParam.parse(req.params);
  const docs    = await service.getPlacementDocuments(id, req.user!.sub, req.user!.role);
  return ok(res, docs);
}
