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
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.resolve(__dirname, '../../uploads');

// Multer resolves relative destinations from process.cwd(). That made uploads
// fail when the backend was launched from the repository root instead of the
// working-memory-backend directory.
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
