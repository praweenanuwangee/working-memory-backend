
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
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

// Use temporary storage on Vercel and local development
const uploadDirectory = path.join(os.tmpdir(), 'uploads');

// Create uploads folder if it does not exist
fs.mkdirSync(uploadDirectory, { recursive: true });

// Multer configuration
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname);
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

      cb(null, filename);
    },
  }),
});

// Working Memory Routes
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

// Shape Prediction
router.post(
  '/predict-shape',
  upload.single('image'),
  asyncHandler(predictShape)
);

export default router;
