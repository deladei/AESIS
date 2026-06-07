import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  attestationContextHandler,
  submitAttestationHandler,
} from './finalization.controller';

// PUBLIC attestation routes — deliberately NOT behind `authenticate`. The signed,
// expiring, single-use magic-link token IS the authorization; the company
// supervisor has no account. Mounted at /api/v1/attest.
const router = Router();

router.get('/:token', asyncHandler(attestationContextHandler));
router.post('/:token', asyncHandler(submitAttestationHandler));

export default router;
