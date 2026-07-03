import { Request, Response } from 'express';
import { riskOverview } from './risk.service';
import type { Actor } from '../entries/entries.policy';

export async function getRiskOverview(req: Request, res: Response) {
  const actor: Actor = { id: req.user!.sub, role: req.user!.role as Actor['role'] };
  const data = await riskOverview(actor);
  res.json({ data });
}
