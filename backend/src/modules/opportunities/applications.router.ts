import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './opportunities.controller';

const router = Router();
router.use(authenticate);

// A student sees their own applications; staff see the cohort's. Scoped in the
// service, never by a client-supplied parameter.
router.get('/', asyncHandler(ctrl.listApplicationsHandler));

// The state machine decides who may make each move: staff shortlist and reject,
// the applicant alone accepts or withdraws.
router.patch('/:id/status', asyncHandler(ctrl.decideApplicationHandler));

export default router;
