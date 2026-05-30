import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './insights.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('academic_supervisor', 'coordinator', 'admin'));

// GET /api/v1/insights          — AI Insights & Analytics aggregation
router.get('/', asyncHandler(ctrl.insights));

// GET /api/v1/insights/interns  — interns + latest submission for Feedback Center
router.get('/interns', asyncHandler(ctrl.interns));

export default router;
