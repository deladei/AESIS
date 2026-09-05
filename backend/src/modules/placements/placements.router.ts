import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './placements.controller';

const router  = Router();
const upload  = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// All placement routes require authentication
router.use(authenticate);

// ── Student ───────────────────────────────────────────────────
router.post(
  '/',
  authorize('student'),
  asyncHandler(ctrl.createPlacementHandler),
);

router.get(
  '/mine',
  authorize('student'),
  asyncHandler(ctrl.getMyPlacementsHandler),
);

// ── Supervisor ────────────────────────────────────────────────
router.get(
  '/assigned',
  authorize('academic_supervisor'),
  asyncHandler(ctrl.getSupervisorPlacementsHandler),
);

// ── Coordinator ───────────────────────────────────────────────
router.get(
  '/',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.listPlacementsHandler),
);

// Before '/:id' so "stats" is never read as a placement id.
router.get(
  '/stats',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.getPlacementStatsHandler),
);

router.patch(
  '/:id/status',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.updatePlacementStatusHandler),
);

router.patch(
  '/:id/supervisor',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.assignSupervisorHandler),
);

// ── Change of attachment (transfer) ───────────────────────────
// Literal paths must register before the '/:id' param route.
router.get(
  '/transfer-requests',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.listTransferRequestsHandler),
);

router.get(
  '/transfer-requests/mine',
  authorize('student'),
  asyncHandler(ctrl.getMyTransferRequestsHandler),
);

router.patch(
  '/transfer-requests/:id/decision',
  authorize('coordinator', 'admin'),
  asyncHandler(ctrl.decideTransferRequestHandler),
);

router.post(
  '/:id/transfer-requests',
  authorize('student'),
  asyncHandler(ctrl.createTransferRequestHandler),
);

// ── Shared (student + supervisor + coordinator) ───────────────
router.get(
  '/:id',
  authorize('student', 'academic_supervisor', 'coordinator', 'admin'),
  asyncHandler(ctrl.getPlacementHandler),
);

// ── Documents ─────────────────────────────────────────────────
router.post(
  '/:id/documents',
  authorize('student'),
  upload.single('file'),
  asyncHandler(ctrl.uploadDocumentHandler),
);

router.get(
  '/:id/documents',
  authorize('student', 'academic_supervisor', 'coordinator', 'admin'),
  asyncHandler(ctrl.listDocumentsHandler),
);

export default router;
