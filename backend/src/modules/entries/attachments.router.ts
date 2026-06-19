import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  attachmentUpload,
  listAttachmentsHandler,
  addAttachmentHandler,
  deleteAttachmentHandler,
} from './attachments.controller';

// Mounted under /entries/:id/attachments (mergeParams). authenticate is applied
// by the parent entries router; per-role rules live in attachments.service via
// assertPlacementAccess + the entry editable gate.
const router = Router({ mergeParams: true });

router.get('/', asyncHandler(listAttachmentsHandler));
router.post('/', attachmentUpload.single('file'), asyncHandler(addAttachmentHandler));
router.delete('/:attachmentId', asyncHandler(deleteAttachmentHandler));

export default router;
