import { Router } from 'express';
import {
  completeLevel,
  getAllProgress,
  getGameProgress,
  getGames,
  getOverview,
  initializeGame,
  recordAdaptiveResult,
  resetAdaptiveProfile,
  resetAllAdaptiveProfiles,
  resetProgress,
  updateLevelProgress,
  predictShape,
} from '../controllers/workingMemoryController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import fs from 'fs';
import multer from 'multer';
import path from 'path';

const router = Router();
const uploadDirectory = path.resolve('uploads');

// Render's filesystem starts clean after a restart, so create the temporary
// upload directory each time the application starts.
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname);
      const filename = `${Date.now()}${extension}`;

      cb(null, filename);
    },
  }),
});

router.get('/games', asyncHandler(getGames));
router.get('/overview', asyncHandler(getOverview));
router.get('/progress', asyncHandler(getAllProgress));
router.post('/progress/reset', asyncHandler(resetProgress));
router.post('/progress/reset-all-adaptive', asyncHandler(resetAllAdaptiveProfiles));
router.post('/progress/:gameId/initialize', asyncHandler(initializeGame));
router.get('/progress/:gameId', asyncHandler(getGameProgress));
router.post('/progress/:gameId/level-progress', asyncHandler(updateLevelProgress));
router.post('/progress/:gameId/complete-level', asyncHandler(completeLevel));
router.post('/progress/:gameId/result', asyncHandler(recordAdaptiveResult));
router.post('/progress/:gameId/reset-adaptive', asyncHandler(resetAdaptiveProfile));

router.post(
  '/predict-shape',
  upload.single('image'),
  asyncHandler(predictShape)
);

export default router;
