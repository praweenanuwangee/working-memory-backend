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
import path from 'path';

const router = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
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
  (req, res, next) => {
    console.log('========== MULTER DEBUG ==========');
    console.log('req.file:', req.file);
    console.log('req.body:', req.body);
    console.log('==================================');

    next();
  },
  asyncHandler(predictShape)
);

export default router;
