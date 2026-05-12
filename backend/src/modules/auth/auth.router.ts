import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { authRateLimiter } from '../../middleware/rateLimiter';
import * as ctrl from './auth.controller';

const router = Router();

// Tighter rate limit on all auth routes
router.use(authRateLimiter);

// Public routes
router.post('/register',                asyncHandler(ctrl.registerHandler));
router.get('/verify-email',             asyncHandler(ctrl.verifyEmailHandler));
router.post('/login',                   asyncHandler(ctrl.loginHandler));
router.post('/refresh',                 asyncHandler(ctrl.refreshHandler));
router.post('/logout',                  asyncHandler(ctrl.logoutHandler));
router.post('/reset-password',          asyncHandler(ctrl.resetPasswordInitHandler));
router.patch('/reset-password/confirm', asyncHandler(ctrl.resetPasswordConfirmHandler));

export default router;
