import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './supervisor.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('academic_supervisor', 'admin'));

// GET /api/v1/supervisor/dashboard
router.get('/dashboard', asyncHandler(ctrl.dashboard));

export default router;
