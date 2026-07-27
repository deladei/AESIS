import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import * as service from './student.service';
import * as recap from './recap.service';

export async function dashboard(req: Request, res: Response) {
  const data = await service.getStudentDashboard(req.user!.sub);
  ok(res, data);
}

export async function internshipRecap(req: Request, res: Response) {
  recap.assertOwnRecap(req.user!.role);
  const data = await recap.getInternshipRecap(req.user!.sub);
  ok(res, data);
}
