import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/authenticate';
import * as ctrl from './messages.controller';

// Mounted at /api/v1/placements — the message thread is keyed by placement (the
// intern). Per-participant authorization lives in messages.service.
const router = Router();

// Same limits and allow-list as the entry attachments — one upload mechanism.
const MESSAGE_FILE_MIME = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (MESSAGE_FILE_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new AppError(415, 'Attach a PDF, DOCX, PNG, JPEG or WebP'));
  },
});

router.use(authenticate);
router.get('/:placementId/messages', asyncHandler(ctrl.listThreadHandler));
router.post(
  '/:placementId/messages',
  upload.array('files', 5),
  asyncHandler(ctrl.postMessageHandler),
);

export default router;
