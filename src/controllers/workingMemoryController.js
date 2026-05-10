import {
  completeLevelForGame,
  ensureGameProgress,
  getAllProgressForUser,
  getProgressForGame,
  listGames,
  recordAdaptiveResultForGame,
  resetAdaptiveProfileForGame,
  resetAllAdaptiveProfilesForUser,
  resetAllProgressForUser,
  updateLevelProgressForGame,
} from '../services/workingMemoryService.js';
import { ApiError } from '../utils/ApiError.js';

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
  const data = await recordAdaptiveResultForGame({ userId, gameId: req.params.gameId, metrics });
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