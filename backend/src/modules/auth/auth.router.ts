import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { authRateLimiter, loginRateLimiter, registerRateLimiter } from '../../middleware/rateLimiter';
import * as ctrl from './auth.controller';

const router = Router();

router.get('/programmes',               asyncHandler(ctrl.programmesHandler));
router.post('/register',                registerRateLimiter, asyncHandler(ctrl.registerHandler));
router.post('/login',                   loginRateLimiter,    asyncHandler(ctrl.loginHandler));
router.get('/verify-email',             authRateLimiter,     asyncHandler(ctrl.verifyEmailHandler));
router.post('/refresh',                 authRateLimiter,     asyncHandler(ctrl.refreshHandler));
router.post('/logout',                  authRateLimiter,     asyncHandler(ctrl.logoutHandler));
router.post('/reset-password',          authRateLimiter,     asyncHandler(ctrl.resetPasswordInitHandler));
router.patch('/reset-password/confirm', authRateLimiter,     asyncHandler(ctrl.resetPasswordConfirmHandler));

export default router;
