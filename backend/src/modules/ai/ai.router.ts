import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import { aiRateLimiter } from '../../middleware/rateLimiter';
import { authorize } from '../../middleware/authorize';
import { assistDayEntryHandler, chatHandler, healthHandler } from './ai.controller';

const router = Router();

router.post('/chat', authenticate, aiRateLimiter, asyncHandler(chatHandler));
router.get('/health', authenticate, asyncHandler(healthHandler));

// Writing help for the student's own logbook entry. Student-only: it works on
// what the caller wrote, and no other role authors a log.
router.post(
  '/assist/day-entry',
  authenticate,
  authorize('student'),
  aiRateLimiter,
  asyncHandler(assistDayEntryHandler),
);

export default router;
