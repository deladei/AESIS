import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export type UserRole =
  | 'student'
  | 'academic_supervisor'
  | 'company_supervisor'
  | 'coordinator'
  | 'hod'
  | 'admin';

// hod carries every coordinator permission; routes that are hod-only (e.g.
// grade release sign-off) list 'hod' explicitly and are NOT satisfied by
// 'coordinator'.
function satisfies(userRole: UserRole, required: UserRole[]): boolean {
  if (required.includes(userRole)) return true;
  return userRole === 'hod' && required.includes('coordinator');
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'Not authenticated');
    }
    if (!satisfies(req.user.role as UserRole, roles)) {
      throw new AppError(403, 'Insufficient permissions');
    }
    next();
  };
}
