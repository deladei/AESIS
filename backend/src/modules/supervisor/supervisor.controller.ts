import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import * as service from './supervisor.service';

export async function dashboard(req: Request, res: Response) {
  const data = await service.getSupervisorDashboard(req.user!.sub);
  ok(res, data);
}
