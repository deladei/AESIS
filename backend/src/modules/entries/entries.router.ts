import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  saveDraftHandler,
  submitHandler,
  acknowledgeHandler,
  returnHandler,
  rejectHandler,
  getEntryHandler,
  getTrailHandler,
  listEntriesHandler,
} from './entries.controller';
import attachmentsRouter from './attachments.router';

// Weekly logbook entry pipeline. All routes require authentication; per-role
// authorization is enforced in the policy layer (entries.policy.ts) + the state
// machine, so the router stays thin and the rules live in one place.
const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(listEntriesHandler));
router.post('/', asyncHandler(saveDraftHandler)); // create or update a draft
router.get('/:id', asyncHandler(getEntryHandler));
router.get('/:id/trail', asyncHandler(getTrailHandler)); // append-only audit trail
router.post('/:id/submit', asyncHandler(submitHandler));
router.post('/:id/acknowledge', asyncHandler(acknowledgeHandler));
router.post('/:id/return', asyncHandler(returnHandler));
router.post('/:id/reject', asyncHandler(rejectHandler));

// Image/document evidence for a week. mergeParams carries `:id` (the entry) in.
router.use('/:id/attachments', attachmentsRouter);

export default router;
