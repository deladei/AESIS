import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './logbook.controller';

const router = Router();

router.use(authenticate);

// ── Student: draft & submission ───────────────────────────────

// GET  /logbook/placements/:placementId/draft?weekNumber=N  — get/init draft for a week
router.get(
  '/placements/:placementId/draft',
  authorize('student'),
  asyncHandler(ctrl.getDraftHandler),
);

// PATCH /logbook/submissions/:submissionId/draft  — save draft content
router.patch(
  '/submissions/:submissionId/draft',
  authorize('student'),
  asyncHandler(ctrl.saveDraftHandler),
);

// POST  /logbook/submissions/:submissionId/submit  — finalise & submit
router.post(
  '/submissions/:submissionId/submit',
  authorize('student'),
  asyncHandler(ctrl.submitLogbookHandler),
);

// POST  /logbook/submissions/:submissionId/attachments  — upload file
router.post(
  '/submissions/:submissionId/attachments',
  authorize('student'),
  ctrl.attachmentUpload.single('file'),
  asyncHandler(ctrl.addAttachmentHandler),
);

// ── Shared read access ────────────────────────────────────────

// GET  /logbook/placements/:placementId/submissions  — list all weeks for a placement
router.get(
  '/placements/:placementId/submissions',
  authorize('student', 'academic_supervisor', 'coordinator', 'admin'),
  asyncHandler(ctrl.listSubmissionsHandler),
);

// GET  /logbook/submissions/:submissionId  — single submission detail
router.get(
  '/submissions/:submissionId',
  authorize('student', 'academic_supervisor', 'coordinator', 'admin'),
  asyncHandler(ctrl.getSubmissionHandler),
);

// GET  /logbook/submissions/:submissionId/attachments
router.get(
  '/submissions/:submissionId/attachments',
  authorize('student', 'academic_supervisor', 'coordinator', 'admin'),
  asyncHandler(ctrl.listAttachmentsHandler),
);

// ── Supervisor: feedback ──────────────────────────────────────

// POST /logbook/submissions/:submissionId/feedback
router.post(
  '/submissions/:submissionId/feedback',
  authorize('academic_supervisor'),
  asyncHandler(ctrl.submitFeedbackHandler),
);

export default router;
