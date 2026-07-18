import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  updateSupervisorHandler,
  verifySupervisorHandler,
  visitConfirmHandler,
  issueTokenHandler,
} from './industry.controller';

// Direct industry-supervisor record operations. Verification endpoints carry
// route-level RBAC; ownership rules live in industry.service.
const router = Router();
router.use(authenticate);

router.patch('/:id', asyncHandler(updateSupervisorHandler));
router.post('/:id/verify', authorize('coordinator', 'admin'), asyncHandler(verifySupervisorHandler));
router.post(
  '/:id/visit-confirm',
  authorize('academic_supervisor', 'admin'),
  asyncHandler(visitConfirmHandler),
);
router.post(
  '/:id/tokens',
  authorize('academic_supervisor', 'coordinator', 'admin'),
  asyncHandler(issueTokenHandler),
);

export default router;
