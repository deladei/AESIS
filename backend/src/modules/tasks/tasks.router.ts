import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import * as ctrl from './tasks.controller';

// Same limits and allow-list as the message and entry attachments — one upload
// mechanism, not a third.
const TASK_FILE_MIME = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (TASK_FILE_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new AppError(415, 'Attach a PDF, DOCX, PNG, JPEG or WebP'));
  },
});

const router = Router();

// Every role has a to-do list; the service decides whose list may be read or
// written, so there is no role guard here beyond being signed in.
router.use(authenticate);

router.get('/', asyncHandler(ctrl.listHandler));
router.post('/', asyncHandler(ctrl.createHandler));
// Set one piece of work for a group. Multipart: the brief travels with it.
router.post('/assign', upload.array('files', 5), asyncHandler(ctrl.assignWorkHandler));
router.delete('/:id/attachments/:attachmentId', asyncHandler(ctrl.removeTaskAttachmentHandler));
router.patch('/:id', asyncHandler(ctrl.updateHandler));
router.delete('/:id', asyncHandler(ctrl.removeHandler));

export default router;
