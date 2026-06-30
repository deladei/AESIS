import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getGradeHandler,
  scoreComponentHandler,
  aggregateGradeHandler,
  overrideGradeHandler,
  releaseGradeHandler,
  inviteIndustryHandler,
  gradeAuditHandler,
  releaseCohortHandler,
  cohortReportHandler,
  cohortStatsHandler,
  cohortRegionsHandler,
} from './grades.controller';

// Final-grade spine. Mounted under /grades; authenticated. Per-action role +
// confidentiality rules live in grades.policy / grades.service.
const router = Router();

router.use(authenticate);

// Cohort-wide action — static segment, declared before the `/:id` routes so it
// is never shadowed by the uuid param.
router.post('/cohort/:academicYearId/release', asyncHandler(releaseCohortHandler)); // bulk-release a cohort's approved grades
router.get('/cohort/:academicYearId/report', asyncHandler(cohortReportHandler)); // coordinator/admin — released-grade export
router.get('/cohort/:academicYearId/stats', asyncHandler(cohortStatsHandler)); // coordinator/admin — grade-distribution analytics
router.get('/cohort/:academicYearId/regions', asyncHandler(cohortRegionsHandler)); // coordinator/admin — per-region grade rollups

router.get('/:id', asyncHandler(getGradeHandler));
router.get('/:id/audit', asyncHandler(gradeAuditHandler)); // coordinator/admin — the grade's audit trail
router.post('/:id/component', asyncHandler(scoreComponentHandler));
router.post('/:id/aggregate', asyncHandler(aggregateGradeHandler));
router.patch('/:id/override', asyncHandler(overrideGradeHandler));
router.post('/:id/release', asyncHandler(releaseGradeHandler));
router.post('/:id/industry-invite', asyncHandler(inviteIndustryHandler)); // issue company-supervisor magic link

export default router;
