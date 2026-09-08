import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  updateSupervisorHandler,
  verifySupervisorHandler,
  visitConfirmHandler,
  issueTokenHandler,
  skillGapsHandler,
} from './industry.controller';

// Direct industry-supervisor record operations. Verification endpoints carry
// route-level RBAC; ownership rules live in industry.service.
const router = Router();
router.use(authenticate);

// GET /api/v1/industry/skill-gaps — departmental weak points from the
// employer evaluations. Registered BEFORE '/:id' so it is not swallowed.
//
// `hod` is here and absent from coordinator.router.ts's blanket guard, which is
// why this lives in the industry module: the head of department is the person
// who acts on a curriculum signal. The set matches `isStaff` — the academic
// supervisor is excluded deliberately, same sealed-envelope rule as the rest of
// this table.
router.get(
  '/skill-gaps',
  authorize('coordinator', 'admin', 'hod'),
  asyncHandler(skillGapsHandler),
);

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
