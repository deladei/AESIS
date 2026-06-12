import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  listEntryObjectivesHandler,
  addEntryObjectivesHandler,
  suggestEntryObjectivesHandler,
  confirmEntryObjectiveHandler,
  removeEntryObjectiveHandler,
} from './objectives.controller';

// Per-entry objective links. Mounted under /entries; authenticated.
// Per-action role rules live in objectives.service.
const router = Router();
router.use(authenticate);

router.get('/:id/objectives', asyncHandler(listEntryObjectivesHandler));
router.post('/:id/objectives', asyncHandler(addEntryObjectivesHandler));
router.post('/:id/objectives/suggest', asyncHandler(suggestEntryObjectivesHandler));
router.post('/:id/objectives/:objectiveId/confirm', asyncHandler(confirmEntryObjectiveHandler));
router.delete('/:id/objectives/:objectiveId', asyncHandler(removeEntryObjectiveHandler));

export default router;
