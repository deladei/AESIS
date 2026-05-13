import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './notifications.controller';

const router = Router();

router.use(authenticate);

// GET  /api/v1/notifications           — paginated list (all or unread)
router.get('/',          asyncHandler(ctrl.list));

// GET  /api/v1/notifications/unread-count
router.get('/unread-count', asyncHandler(ctrl.unreadCount));

// PATCH /api/v1/notifications/:id/read — mark one read
router.patch('/:id/read',  asyncHandler(ctrl.markOneRead));

// PATCH /api/v1/notifications/read-all — mark all read
router.patch('/read-all',  asyncHandler(ctrl.markAllRead));

export default router;
