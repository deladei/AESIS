import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import { chatHandler } from './ai.controller';

const router = Router();

router.post('/chat', authenticate, asyncHandler(chatHandler));

export default router;
