import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import { aiRateLimiter } from '../../middleware/rateLimiter';
import { chatHandler } from './ai.controller';

const router = Router();

router.post('/chat', authenticate, aiRateLimiter, asyncHandler(chatHandler));

export default router;
