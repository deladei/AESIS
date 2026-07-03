import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import { getRiskOverview } from './risk.controller';

const router = Router();

// Advisory risk signals over live entries data. Read-only; students never see
// tiers (a tier flags a conversation, it is not feedback to the student).
router.get(
  '/overview',
  authenticate,
  authorize('academic_supervisor', 'coordinator', 'admin'),
  asyncHandler(getRiskOverview),
);

export default router;
