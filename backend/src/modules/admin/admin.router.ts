import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './admin.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('admin'));

// GET /api/v1/admin/dashboard
router.get('/dashboard', asyncHandler(ctrl.dashboard));

// AI enrichment pipeline ops (queue health + revive stuck jobs)
router.get('/ai/enrichment', asyncHandler(ctrl.enrichmentHealth));
router.post('/ai/enrichment/revive', asyncHandler(ctrl.enrichmentRevive));

// Messaging: admin → active interns (in-app + email), schedule a Google Meet
router.get('/messaging/recipients', asyncHandler(ctrl.messageableInterns));
router.post('/messaging/:placementId/message', asyncHandler(ctrl.messageIntern));
router.post('/messaging/:placementId/schedule-call', asyncHandler(ctrl.scheduleCall));

export default router;
