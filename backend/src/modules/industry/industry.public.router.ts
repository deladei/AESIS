import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { formContextHandler, digitalAssessmentHandler } from './industry.controller';

// PUBLIC single-use magic-link routes for the industry supervisor's final
// assessment. No account, no login — the token IS the authorization; it is
// scoped to one placement + supervisor and consumed on submit. Only issuable
// for verified supervisors (DB trigger on assessment_token).
const router = Router();

router.get('/:token', asyncHandler(formContextHandler));
router.post('/:token', asyncHandler(digitalAssessmentHandler));

export default router;
