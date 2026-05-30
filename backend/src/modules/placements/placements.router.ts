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
