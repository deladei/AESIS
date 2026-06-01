import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import * as service from './admin.service';

export async function dashboard(_req: Request, res: Response) {
  const data = await service.getAdminDashboard();
  ok(res, data);
}
