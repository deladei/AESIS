import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import { createSupervisorHandler, listSupervisorsHandler } from './industry.controller';

// Per-placement industry supervisor records. Mounted under /placements;
// per-action role rules live in industry.service.
const router = Router();
router.use(authenticate);

router.get('/:id/industry-supervisors', asyncHandler(listSupervisorsHandler));
router.post('/:id/industry-supervisors', asyncHandler(createSupervisorHandler));

export default router;
