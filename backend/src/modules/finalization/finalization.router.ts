import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  recordAssessmentHandler,
  finalizeHandler,
  inviteAttestationHandler,
  getFinalAssessmentHandler,
} from './finalization.controller';

// Placement finalization + attestation invites. Mounted under /placements;
// authenticated. Per-action role rules live in finalization.service.
const router = Router();

router.use(authenticate);

router.get('/:id/final-assessment', asyncHandler(getFinalAssessmentHandler));
router.post('/:id/assessment', asyncHandler(recordAssessmentHandler));
router.post('/:id/finalize', asyncHandler(finalizeHandler));
router.post('/:id/attestation/invite', asyncHandler(inviteAttestationHandler));

export default router;
