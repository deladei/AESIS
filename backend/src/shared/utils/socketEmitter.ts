import { getIo } from '../../config/socket';
import { logger } from '../../config/logger';

export function emitToUser(userId: string, event: string, payload: unknown): void {
  try {
    const io = getIo();
    io.to(`user:${userId}`).emit(event, payload);
    logger.debug('socket emit', { userId, event });
  } catch (err) {
    logger.warn('socketEmitter: could not emit (socket not ready)', { err, userId, event });
  }
}
