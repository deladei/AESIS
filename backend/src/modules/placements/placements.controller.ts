import { Request, Response } from 'express';
import {
  createPlacementSchema,
  updatePlacementStatusSchema,
  assignSupervisorSchema,
  createCompanySchema,
  createTransferRequestSchema,
  decideTransferRequestSchema,
} from './placements.schema';
import * as service from './placements.service';
import * as transfers from './transfers.service';
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

export async function assignSupervisorHandler(req: Request, res: Response) {
  const { id }  = uuidParam.parse(req.params);
  const input   = assignSupervisorSchema.parse(req.body);
  const updated = await service.assignSupervisor(id, req.user!.sub, input);
  return ok(res, updated);
}

export async function listPlacementsHandler(req: Request, res: Response) {
  const { page, limit } = paginationQuery.parse(req.query);
  const statusFilter = z.enum(['pending', 'active', 'completed', 'withdrawn', 'failed', 'transferred_out', 'cancelled'])
    .optional()
    .parse(req.query['status']);

  const result = await service.listPlacements({
    status: statusFilter,
    academicYearId: req.query['academicYearId'] as string | undefined,
    q: z.string().max(120).optional().parse(req.query['q']),
    page,
    limit,
  });
  return ok(res, result.placements, result.meta);
}

export async function getSupervisorPlacementsHandler(req: Request, res: Response) {
  const placements = await service.getSupervisorPlacements(req.user!.sub);
  return ok(res, placements);
}

// ── Change of attachment (transfer) ───────────────────────────

export async function createTransferRequestHandler(req: Request, res: Response) {
  const { id }  = uuidParam.parse(req.params);
  const input   = createTransferRequestSchema.parse(req.body);
  const request = await transfers.createTransferRequest(req.user!.sub, id, input);
  return created(res, request);
}

export async function getMyTransferRequestsHandler(req: Request, res: Response) {
  const requests = await transfers.getMyTransferRequests(req.user!.sub);
  return ok(res, requests);
}

export async function listTransferRequestsHandler(req: Request, res: Response) {
  const { page, limit } = paginationQuery.parse(req.query);
  const status = z.enum(['requested', 'approved', 'rejected'])
    .optional()
    .parse(req.query['status']);
  const result = await transfers.listTransferRequests({ status, page, limit });
  return ok(res, result.requests, result.meta);
}

export async function decideTransferRequestHandler(req: Request, res: Response) {
  const { id }  = uuidParam.parse(req.params);
  const input   = decideTransferRequestSchema.parse(req.body);
  const request = await transfers.decideTransferRequest(id, req.user!.sub, input);
  return ok(res, request);
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

export async function getCompaniesOverviewHandler(_req: Request, res: Response) {
  const overview = await service.getCompaniesOverview();
  return ok(res, overview);
}

export async function getCompanyAnalyticsHandler(req: Request, res: Response) {
  const { id } = uuidParam.parse(req.params);
  const analytics = await service.getCompanyAnalytics(id);
  return ok(res, analytics);
}

export async function getCompanyInternsHandler(req: Request, res: Response) {
  const { id } = uuidParam.parse(req.params);
  const result = await service.getCompanyInterns(id);
  return ok(res, result);
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
