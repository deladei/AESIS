import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/authenticate';
import * as ctrl from './messages.controller';

// Mounted at /api/v1/placements — the message thread is keyed by placement (the
// intern). Per-participant authorization lives in messages.service.
const router = Router();

router.use(authenticate);
router.get('/:placementId/messages', asyncHandler(ctrl.listThreadHandler));
router.post('/:placementId/messages', asyncHandler(ctrl.postMessageHandler));

export default router;
