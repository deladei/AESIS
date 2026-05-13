import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './coordinator.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('coordinator', 'admin'));

// GET /api/v1/coordinator/dashboard
router.get('/dashboard', asyncHandler(ctrl.dashboard));

// GET /api/v1/coordinator/students
router.get('/students', asyncHandler(ctrl.students));

export default router;
