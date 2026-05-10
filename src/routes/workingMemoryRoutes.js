import { Router } from 'express';
import {
  completeLevel,
  getAllProgress,
  getGameProgress,
  getGames,
  initializeGame,
  recordAdaptiveResult,
  resetAdaptiveProfile,
  resetAllAdaptiveProfiles,
  resetProgress,
  updateLevelProgress,
} from '../controllers/workingMemoryController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/games', asyncHandler(getGames));
router.get('/progress', asyncHandler(getAllProgress));
router.post('/progress/reset', asyncHandler(resetProgress));
router.post('/progress/reset-all-adaptive', asyncHandler(resetAllAdaptiveProfiles));
router.post('/progress/:gameId/initialize', asyncHandler(initializeGame));
router.get('/progress/:gameId', asyncHandler(getGameProgress));
router.post('/progress/:gameId/level-progress', asyncHandler(updateLevelProgress));
router.post('/progress/:gameId/complete-level', asyncHandler(completeLevel));
router.post('/progress/:gameId/result', asyncHandler(recordAdaptiveResult));
router.post('/progress/:gameId/reset-adaptive', asyncHandler(resetAdaptiveProfile));

export default router;