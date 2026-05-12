import { Response } from 'express';
import { ApiResponse } from '../types';

export function ok<T>(res: Response, data: T, meta?: ApiResponse['meta']) {
  return res.status(200).json({ status: 'success', data, ...(meta && { meta }) });
}

export function created<T>(res: Response, data: T) {
  return res.status(201).json({ status: 'success', data });
}

export function noContent(res: Response) {
  return res.status(204).send();
}
