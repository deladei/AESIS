import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './student.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('student', 'admin'));

// GET /api/v1/student/dashboard
router.get('/dashboard', asyncHandler(ctrl.dashboard));

export default router;
