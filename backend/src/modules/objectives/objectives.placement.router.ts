import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import { defineObjectiveHandler, listObjectivesHandler } from './objectives.controller';

// Per-placement learning objectives. Mounted under /placements; authenticated.
// Per-action role rules live in objectives.service.
const router = Router();
router.use(authenticate);

router.get('/:id/objectives', asyncHandler(listObjectivesHandler));
router.post('/:id/objectives', asyncHandler(defineObjectiveHandler));

export default router;
