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

export default router;
