import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { industryContextHandler, submitIndustryHandler } from './grades.controller';

// PUBLIC industry-score routes — deliberately NOT behind `authenticate`. The
// signed, expiring, single-use magic-link token IS the authorization; the
// company supervisor has no account. Mounted at /api/v1/grade-invite.
const router = Router();

router.get('/:token', asyncHandler(industryContextHandler));
router.post('/:token', asyncHandler(submitIndustryHandler));

export default router;
