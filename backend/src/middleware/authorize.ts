import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export type UserRole =
  | 'student'
  | 'academic_supervisor'
  | 'company_supervisor'
  | 'coordinator'
  | 'admin';

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'Not authenticated');
    }
    if (!roles.includes(req.user.role as UserRole)) {
      throw new AppError(403, 'Insufficient permissions');
    }
    next();
  };
}
