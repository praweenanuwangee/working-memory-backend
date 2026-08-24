import { getGameDefinition, WORKING_MEMORY_GAME_MAP, WORKING_MEMORY_GAMES } from '../constants/gameRegistry.js';
import { WorkingMemoryProgress } from '../models/WorkingMemoryProgress.js';
import { createAdaptiveProfile, updateAdaptiveProfile } from './adaptiveDifficultyService.js';
import { ApiError } from '../utils/ApiError.js';

const TRANSIENT_MONGO_ERROR_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const isTransientMongoError = (error) => {
  const code = error?.code || error?.cause?.code;
  const message = String(error?.message || '');
  return TRANSIENT_MONGO_ERROR_CODES.has(code)
    || /ENOTFOUND|EAI_AGAIN|server selection timed out/i.test(message);
};

const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const runWithMongoRetry = async (operation, maxAttempts = 3) => {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientMongoError(error) || attempt === maxAttempts) throw error;
      await wait(250 * attempt);
    }
  }

  throw lastError;
};

const defaultProgressState = () => ({
  currentLevel: 1,
  completedLevels: [],
  unlockedLevels: [1],
  levelStats: {},
  levelProgress: {},
  performanceHistory: [],
  adaptiveProfile: createAdaptiveProfile(),
});

const normalizeProgressDocument = (document) => {
  const source = document.toObject ? document.toObject() : document;
  return {
    ...source,
    levelStats: source.levelStats instanceof Map ? Object.fromEntries(source.levelStats) : (source.levelStats || {}),
    levelProgress: source.levelProgress instanceof Map ? Object.fromEntries(source.levelProgress) : (source.levelProgress || {}),
    adaptiveProfile: createAdaptiveProfile(source.adaptiveProfile),
  };
};

const ensureKnownGame = (gameId) => {
  const game = getGameDefinition(gameId);
  if (!game) {
    throw new ApiError(404, `Unknown working-memory game: ${gameId}`);
  }
  return game;
};

export const listGames = () => WORKING_MEMORY_GAMES;

export const ensureGameProgress = async (userId, gameId) => {
  ensureKnownGame(gameId);

  const progress = await WorkingMemoryProgress.findOneAndUpdate(
    { userId, gameId },
    {
      $setOnInsert: {
        userId,
        gameId,
        ...defaultProgressState(),
      },
    },
    {
      upsert: true,
      new: true,
    },
  );

  return normalizeProgressDocument(progress);
};

export const getAllProgressForUser = async (userId) => {
  const documents = await WorkingMemoryProgress.find({ userId }).sort({ gameId: 1 });
  const byGameId = new Map(documents.map((document) => {
    const normalized = normalizeProgressDocument(document);
    return [normalized.gameId, normalized];
  }));

  const results = [];
  for (const game of WORKING_MEMORY_GAMES) {
    if (byGameId.has(game.gameId)) {
      results.push(byGameId.get(game.gameId));
      continue;
    }

    results.push(await ensureGameProgress(userId, game.gameId));
  }

  return results;
};

export const getProgressForGame = async (userId, gameId) => {
  const progress = await ensureGameProgress(userId, gameId);
  return progress;
};

export const updateLevelProgressForGame = async ({ userId, gameId, level, percent = 0, stats = null }) => {
  ensureKnownGame(gameId);
  const safeLevel = Number(level);
  if (!Number.isInteger(safeLevel) || safeLevel < 1) {
    throw new ApiError(400, 'level must be a positive integer');
  }

  const progress = await ensureGameProgress(userId, gameId);
  const nextLevelProgress = {
    ...progress.levelProgress,
    [safeLevel]: Math.max(0, Math.min(100, Math.round(percent))),
  };

  const nextLevelStats = { ...progress.levelStats };
  if (stats && typeof stats === 'object') {
    nextLevelStats[safeLevel] = {
      ...(nextLevelStats[safeLevel] || {}),
      ...stats,
    };
  }

  const updated = await WorkingMemoryProgress.findOneAndUpdate(
    { userId, gameId },
    {
      $set: {
        levelProgress: nextLevelProgress,
        levelStats: nextLevelStats,
      },
    },
    { new: true },
  );

  return normalizeProgressDocument(updated);
};

export const completeLevelForGame = async ({ userId, gameId, level, stats = null }) => {
  const game = ensureKnownGame(gameId);
  const safeLevel = Number(level);
  if (!Number.isInteger(safeLevel) || safeLevel < 1) {
    throw new ApiError(400, 'level must be a positive integer');
  }

  const progress = await ensureGameProgress(userId, gameId);
  const completedLevels = Array.from(new Set([...(progress.completedLevels || []), safeLevel])).sort((left, right) => left - right);
  const unlockedLevels = Array.from(new Set([1, ...(progress.unlockedLevels || []), Math.min(game.maxLevels, safeLevel + 1)])).sort((left, right) => left - right);
  const levelStats = { ...progress.levelStats };
  const levelProgress = {
    ...progress.levelProgress,
    [safeLevel]: 100,
  };

  if (stats && typeof stats === 'object') {
    levelStats[safeLevel] = stats;
  }

  const updated = await WorkingMemoryProgress.findOneAndUpdate(
    { userId, gameId },
    {
      $set: {
        currentLevel: Math.min(game.maxLevels, Math.max(progress.currentLevel || 1, safeLevel + 1)),
        completedLevels,
        unlockedLevels,
        levelStats,
        levelProgress,
      },
    },
    { new: true },
  );

  return normalizeProgressDocument(updated);
};

export const recordAdaptiveResultForGame = async ({ userId, gameId, metrics = {} }) => {
  ensureKnownGame(gameId);
  const progress = await runWithMongoRetry(() => ensureGameProgress(userId, gameId));
  const adaptiveProfile = updateAdaptiveProfile(progress.adaptiveProfile, metrics);
  const latestResult = adaptiveProfile.recentResults.at(-1);
  const performanceResult = {
    accuracy: latestResult?.accuracy ?? adaptiveProfile.lastAccuracy ?? 0,
    mistakes: latestResult?.mistakes ?? null,
    attempts: latestResult?.attempts ?? null,
    averageResponseMs: latestResult?.averageResponseMs ?? null,
    timestamp: latestResult?.timestamp ?? new Date(),
    // Preserve the game-specific data too, so it remains available for future
    // report improvements without changing the adaptive profile format.
    metrics,
  };

  const updated = await runWithMongoRetry(() => WorkingMemoryProgress.findOneAndUpdate(
    { userId, gameId },
    {
      $set: {
        adaptiveProfile,
      },
      $push: {
        performanceHistory: performanceResult,
      },
    },
    { new: true },
  ));

  return normalizeProgressDocument(updated);
};

export const resetAdaptiveProfileForGame = async ({ userId, gameId }) => {
  ensureKnownGame(gameId);
  const progress = await ensureGameProgress(userId, gameId);

  const updated = await WorkingMemoryProgress.findOneAndUpdate(
    { userId, gameId },
    {
      $set: {
        adaptiveProfile: createAdaptiveProfile(),
      },
    },
    { new: true },
  );

  return normalizeProgressDocument(updated || progress);
};

export const resetAllAdaptiveProfilesForUser = async (userId) => {
  await WorkingMemoryProgress.updateMany(
    { userId },
    {
      $set: {
        adaptiveProfile: createAdaptiveProfile(),
      },
    },
  );

  return getAllProgressForUser(userId);
};

export const resetAllProgressForUser = async (userId) => {
  await WorkingMemoryProgress.deleteMany({ userId });
  return [];
};

export const getOverviewForUser = async (userId = null) => {
  const total = WORKING_MEMORY_GAMES.length;
  const available = WORKING_MEMORY_GAMES.filter((g) => g.available).length;
  const adaptive = WORKING_MEMORY_GAMES.filter((g) => g.adaptive && g.available).length;

  const gamesSummary = {
    total,
    available,
    adaptive,
    locked: total - available,
  };

  if (!userId) {
    return { games: gamesSummary, userProgress: null };
  }

  const documents = await WorkingMemoryProgress.find({ userId }).lean();

  const completedGames = documents.filter((d) => {
    const game = WORKING_MEMORY_GAME_MAP.get(d.gameId);
    return game && d.completedLevels && d.completedLevels.length >= game.maxLevels;
  }).length;

  const inProgressGames = documents.filter((d) => {
    const game = WORKING_MEMORY_GAME_MAP.get(d.gameId);
    return game && d.completedLevels && d.completedLevels.length > 0 && d.completedLevels.length < game.maxLevels;
  }).length;

  const adaptiveTiers = documents.reduce(
    (acc, d) => {
      const tier = d.adaptiveProfile?.tier ?? 'balanced';
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    },
    { support: 0, balanced: 0, challenge: 0 },
  );

  return {
    games: gamesSummary,
    userProgress: {
      completedGames,
      inProgressGames,
      notStartedGames: available - completedGames - inProgressGames,
      adaptiveTiers,
    },
  };
};
