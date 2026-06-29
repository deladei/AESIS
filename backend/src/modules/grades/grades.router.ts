import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getGradeHandler,
  scoreComponentHandler,
  aggregateGradeHandler,
  overrideGradeHandler,
  releaseGradeHandler,
} from './grades.controller';

// Final-grade spine. Mounted under /grades; authenticated. Per-action role +
// confidentiality rules live in grades.policy / grades.service.
const router = Router();

router.use(authenticate);

router.get('/:id', asyncHandler(getGradeHandler));
router.post('/:id/component', asyncHandler(scoreComponentHandler));
router.post('/:id/aggregate', asyncHandler(aggregateGradeHandler));
router.patch('/:id/override', asyncHandler(overrideGradeHandler));
router.post('/:id/release', asyncHandler(releaseGradeHandler));

export default router;
