
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
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const router = Router();

// ============================================================
// UPLOAD DIRECTORY CONFIGURATION
// ============================================================

// Vercel serverless functions have a read-only application
// directory. Use the writable temporary directory instead.

const uploadDirectory = path.join(os.tmpdir(), 'uploads');

// Create the upload directory if it does not exist.
fs.mkdirSync(uploadDirectory, { recursive: true });

// ============================================================
// MULTER CONFIGURATION
// ============================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);

    const uniqueName =
      `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024, // Maximum 5 MB
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG and WEBP images are allowed.'));
    }
  },
});

// ============================================================
// WORKING MEMORY GAME ROUTES
// ============================================================

router.get('/games', asyncHandler(getGames));

router.get('/overview', asyncHandler(getOverview));

// ============================================================
// PROGRESS TRACKING ROUTES
// ============================================================

router.get('/progress', asyncHandler(getAllProgress));

router.post(
  '/progress/reset',
  asyncHandler(resetProgress)
);

router.post(
  '/progress/reset-all-adaptive',
  asyncHandler(resetAllAdaptiveProfiles)
);

router.post(
  '/progress/:gameId/initialize',
  asyncHandler(initializeGame)
);

router.get(
  '/progress/:gameId',
  asyncHandler(getGameProgress)
);

router.post(
  '/progress/:gameId/level-progress',
  asyncHandler(updateLevelProgress)
);

router.post(
  '/progress/:gameId/complete-level',
  asyncHandler(completeLevel)
);

router.post(
  '/progress/:gameId/result',
  asyncHandler(recordAdaptiveResult)
);

router.post(
  '/progress/:gameId/reset-adaptive',
  asyncHandler(resetAdaptiveProfile)
);

// ============================================================
// SHAPE PREDICTION ROUTE
// ============================================================

router.post(
  '/predict-shape',
  upload.single('image'),
  asyncHandler(predictShape)
);

// ============================================================
// EXPORT ROUTER
// ============================================================

export default router;
