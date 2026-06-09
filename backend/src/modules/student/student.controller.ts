import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import * as service from './student.service';

export async function dashboard(req: Request, res: Response) {
  const data = await service.getStudentDashboard(req.user!.sub);
  ok(res, data);
}
