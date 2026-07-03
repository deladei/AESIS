import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import { aiRateLimiter } from '../../middleware/rateLimiter';
import { chatHandler, healthHandler } from './ai.controller';

const router = Router();

router.post('/chat', authenticate, aiRateLimiter, asyncHandler(chatHandler));
router.get('/health', authenticate, asyncHandler(healthHandler));

export default router;
