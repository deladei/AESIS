import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './placements.controller';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.createCompanyHandler),
);

router.get(
  '/',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.listCompaniesHandler),
);

router.get(
  '/:id/analytics',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.getCompanyAnalyticsHandler),
);

router.get(
  '/:id/interns',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.getCompanyInternsHandler),
);

export default router;
