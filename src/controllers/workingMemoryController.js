
import {
  completeLevelForGame,
  ensureGameProgress,
  getAllProgressForUser,
  getOverviewForUser,
  getProgressForGame,
  listGames,
  recordAdaptiveResultForGame,
  resetAdaptiveProfileForGame,
  resetAllAdaptiveProfilesForUser,
  resetAllProgressForUser,
  updateLevelProgressForGame,
} from '../services/workingMemoryService.js';

import { ApiError } from '../utils/ApiError.js';
import fs from 'node:fs';
import { runPrediction } from '../services/shapePredictionService.js';

// ============================================================
// CONFIGURATION
// ============================================================

// Vercel calls the internal ML service binding; local Node-only runs use the CLI.
// ============================================================
// USER ID HELPER
// ============================================================

const resolveUserId = (req) => {
  const bodyUserId =
    req.body && typeof req.body === 'object'
      ? req.body.userId
      : undefined;

  const userId =
    bodyUserId ||
    req.query.userId ||
    req.headers['x-user-id'];

  if (!userId || typeof userId !== 'string') {
    throw new ApiError(
      400,
      'userId is required in body, query, or x-user-id header'
    );
  }

  return userId.trim();
};

// ============================================================
// GAME MANAGEMENT
// ============================================================

export const getGames = async (req, res) => {
  res.status(200).json({
    success: true,
    data: listGames(),
  });
};

export const getOverview = async (req, res) => {
  const rawUserId =
    req.query.userId || req.headers['x-user-id'];

  const userId =
    rawUserId && typeof rawUserId === 'string'
      ? rawUserId.trim() || null
      : null;

  const data = await getOverviewForUser(userId);

  res.status(200).json({
    success: true,
    data,
  });
};

// ============================================================
// PROGRESS TRACKING
// ============================================================

export const initializeGame = async (req, res) => {
  const userId = resolveUserId(req);

  const data = await ensureGameProgress(
    userId,
    req.params.gameId
  );

  res.status(200).json({
    success: true,
    data,
  });
};

export const getAllProgress = async (req, res) => {
  const userId = resolveUserId(req);

  const data = await getAllProgressForUser(userId);

  res.status(200).json({
    success: true,
    data,
  });
};

export const getGameProgress = async (req, res) => {
  const userId = resolveUserId(req);

  const data = await getProgressForGame(
    userId,
    req.params.gameId
  );

  res.status(200).json({
    success: true,
    data,
  });
};

export const updateLevelProgress = async (req, res) => {
  const userId = resolveUserId(req);

  const { level, percent, stats } = req.body;

  if (
    !Number.isFinite(Number(percent)) ||
    Number(percent) < 0 ||
    Number(percent) > 100
  ) {
    throw new ApiError(
      400,
      'percent must be a number between 0 and 100'
    );
  }

  const data = await updateLevelProgressForGame({
    userId,
    gameId: req.params.gameId,
    level,
    percent,
    stats,
  });

  res.status(200).json({
    success: true,
    data,
  });
};

export const completeLevel = async (req, res) => {
  const userId = resolveUserId(req);

  const { level, stats } = req.body;

  const data = await completeLevelForGame({
    userId,
    gameId: req.params.gameId,
    level,
    stats,
  });

  res.status(200).json({
    success: true,
    data,
  });
};

// ============================================================
// ADAPTIVE LEARNING
// ============================================================

export const recordAdaptiveResult = async (req, res) => {
  const userId = resolveUserId(req);

  const { metrics } = req.body;

  if (
    metrics !== undefined &&
    (
      typeof metrics !== 'object' ||
      metrics === null ||
      Array.isArray(metrics)
    )
  ) {
    throw new ApiError(
      400,
      'metrics must be a plain object'
    );
  }

  const data = await recordAdaptiveResultForGame({
    userId,
    gameId: req.params.gameId,
    metrics: metrics || {},
  });

  res.status(200).json({
    success: true,
    data,
  });
};

export const resetAdaptiveProfile = async (req, res) => {
  const userId = resolveUserId(req);

  const data = await resetAdaptiveProfileForGame(
    userId,
    req.params.gameId
  );

  res.status(200).json({
    success: true,
    data,
  });
};

export const resetAllAdaptiveProfiles = async (req, res) => {
  const userId = resolveUserId(req);

  const data = await resetAllAdaptiveProfilesForUser(
    userId
  );

  res.status(200).json({
    success: true,
    data,
  });
};

export const resetProgress = async (req, res) => {
  const userId = resolveUserId(req);

  const data = await resetAllProgressForUser(userId);

  res.status(200).json({
    success: true,
    data,
  });
};

// ============================================================
// SHAPE PREDICTION - LOCAL PYTHON
// ============================================================

export const predictShape = async (req, res) => {
  if (!req.file) {
    throw new ApiError(
      400,
      'Image file is required'
    );
  }

  const imagePath = req.file.path;

  try {
    const predictions = await runPrediction(imagePath, req.file);

    if (!Array.isArray(predictions)) {
      throw new ApiError(
        502,
        'Invalid ML prediction response'
      );
    }

    // Select strongest prediction
    for (const item of predictions) {
      if (!item || !['circle', 'square', 'triangle'].includes(item.shape) ||
          typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) ||
          item.confidence < 0 || item.confidence > 1) {
        throw new ApiError(502, 'Invalid ML prediction response');
      }
    }
    const prediction = predictions.reduce((best, item) =>
      !best || item.confidence > best.confidence ? item : best, null);

    // Calculate confidence level
    let confidenceLevel = 'Not Detected';

    if (prediction) {
      const confidence = Number(
        prediction.confidence
      );

      if (!Number.isFinite(confidence)) {
        throw new ApiError(
          502,
          'Invalid prediction confidence'
        );
      }

      if (confidence < 0.40) {
        confidenceLevel = 'Not Detected';
      } else if (confidence < 0.55) {
        confidenceLevel = 'Low';
      } else if (confidence < 0.70) {
        confidenceLevel = 'Medium';
      } else if (confidence < 0.80) {
        confidenceLevel = 'Good';
      } else {
        confidenceLevel = 'Very Good';
      }
    }

    // Send prediction result to React frontend
    res.status(200).json({
      success: true,
      data: prediction
        ? {
            shape: prediction.shape,
            confidence: prediction.confidence,
            confidenceLevel,
          }
        : {
            shape: null,
            confidence: 0,
            confidenceLevel: 'Not Detected',
          },
    });

  } finally {
    // Remove uploaded temporary image
    try {
      await fs.promises.unlink(imagePath);
    } catch (error) {
      console.warn(
        'Temporary image cleanup failed:',
        error.message
      );
    }
  }
};
