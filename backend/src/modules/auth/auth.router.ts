import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/authenticate';
import * as ctrl from './auth.controller';

const router = Router();

router.get('/programmes',               asyncHandler(ctrl.programmesHandler));
router.get('/me',                       authenticate, asyncHandler(ctrl.meHandler));
router.post('/register',                asyncHandler(ctrl.registerHandler));
router.post('/login',                   asyncHandler(ctrl.loginHandler));
router.get('/verify-email',             asyncHandler(ctrl.verifyEmailHandler));
router.post('/refresh',                 asyncHandler(ctrl.refreshHandler));
router.post('/logout',                  asyncHandler(ctrl.logoutHandler));
router.post('/reset-password',          asyncHandler(ctrl.resetPasswordInitHandler));
router.patch('/reset-password/confirm', asyncHandler(ctrl.resetPasswordConfirmHandler));

export default router;
