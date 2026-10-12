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
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mlFolder = path.resolve(__dirname, '../../ml');
const predictScript = path.join(mlFolder, 'predict.py');
const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python';
const predictionTimeoutMs = Number(process.env.PREDICTION_TIMEOUT_MS) || 30000;

const resolveUserId = (req) => {
  const bodyUserId = req.body && typeof req.body === 'object' ? req.body.userId : undefined;
  const userId = bodyUserId || req.query.userId || req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    throw new ApiError(400, 'userId is required in body, query, or x-user-id header');
  }
  return userId.trim();
};

export const getGames = async (req, res) => {
  res.status(200).json({
    success: true,
    data: listGames(),
  });
};

export const getOverview = async (req, res) => {
  // userId is optional — returns user-specific stats when provided
  const rawUserId = req.query.userId || req.headers['x-user-id'];
  const userId = rawUserId && typeof rawUserId === 'string' ? rawUserId.trim() || null : null;
  const data = await getOverviewForUser(userId);
  res.status(200).json({ success: true, data });
};

export const initializeGame = async (req, res) => {
  const userId = resolveUserId(req);
  const data = await ensureGameProgress(userId, req.params.gameId);
  res.status(200).json({ success: true, data });
};

export const getAllProgress = async (req, res) => {
  const userId = resolveUserId(req);
  const data = await getAllProgressForUser(userId);
  res.status(200).json({ success: true, data });
};

export const getGameProgress = async (req, res) => {
  const userId = resolveUserId(req);
  const data = await getProgressForGame(userId, req.params.gameId);
  res.status(200).json({ success: true, data });
};

export const updateLevelProgress = async (req, res) => {
  const userId = resolveUserId(req);
  const { level, percent, stats } = req.body;
  if (!Number.isFinite(Number(percent)) || Number(percent) < 0 || Number(percent) > 100) {
    throw new ApiError(400, 'percent must be a number between 0 and 100');
  }
  const data = await updateLevelProgressForGame({ userId, gameId: req.params.gameId, level, percent, stats });
  res.status(200).json({ success: true, data });
};

export const completeLevel = async (req, res) => {
  const userId = resolveUserId(req);
  const { level, stats } = req.body;
  const data = await completeLevelForGame({ userId, gameId: req.params.gameId, level, stats });
  res.status(200).json({ success: true, data });
};

export const recordAdaptiveResult = async (req, res) => {
  const userId = resolveUserId(req);
  const { metrics } = req.body;
  if (metrics !== undefined && (typeof metrics !== 'object' || metrics === null || Array.isArray(metrics))) {
    throw new ApiError(400, 'metrics must be a plain object');
  }
  const data = await recordAdaptiveResultForGame({ userId, gameId: req.params.gameId, metrics: metrics || {} });
  res.status(200).json({ success: true, data });
};

export const resetAdaptiveProfile = async (req, res) => {
  const userId = resolveUserId(req);
  const data = await resetAdaptiveProfileForGame({ userId, gameId: req.params.gameId });
  res.status(200).json({ success: true, data });
};

export const resetAllAdaptiveProfiles = async (req, res) => {
  const userId = resolveUserId(req);
  const data = await resetAllAdaptiveProfilesForUser(userId);
  res.status(200).json({ success: true, data });
};

export const resetProgress = async (req, res) => {
  const userId = resolveUserId(req);
  const data = await resetAllProgressForUser(userId);
  res.status(200).json({ success: true, data });
};
export const predictShape = async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Image file is required');
  }

  const imagePath = req.file.path;

  try {
    const result = await new Promise((resolve, reject) => {
      const python = spawn(pythonExecutable, [
        predictScript,
        imagePath,
      ]);

      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };

      const timeout = setTimeout(() => {
        python.kill();
        finish(
          reject,
          new ApiError(504, `Shape prediction timed out after ${predictionTimeoutMs}ms`),
        );
      }, predictionTimeoutMs);

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('error', (error) => {
        finish(
          reject,
          new ApiError(
            503,
            `Could not start shape prediction with "${pythonExecutable}"`,
            { cause: error.message },
          ),
        );
      });

      python.on('close', (code) => {
        if (settled) return;

        if (code !== 0) {
          finish(
            reject,
            new ApiError(500, 'Shape prediction failed', {
              cause: errorOutput.trim() || `Python exited with code ${code}`,
            }),
          );
          return;
        }

        try {
          const parsedOutput = JSON.parse(output);
          if (!Array.isArray(parsedOutput)) {
            throw new Error('Prediction output must be an array');
          }
          finish(resolve, parsedOutput);
        } catch (error) {
          finish(
            reject,
            new ApiError(500, 'Invalid shape prediction response', {
              cause: error.message,
            }),
          );
        }
      });
    });

    const prediction = result[0] || null;

    let confidenceLevel = 'Not Detected';

    if (prediction) {
      const confidence = prediction.confidence;

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

    res.status(200).json({
      success: true,
      data: prediction
        ? {
            ...prediction,
            confidenceLevel,
          }
        : {
            shape: null,
            confidence: 0,
            confidenceLevel: 'Not Detected',
          },
    });
  } finally {
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
};
