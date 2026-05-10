const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const getAdaptiveTier = (score = 50) => {
  if (score <= 35) return 'support';
  if (score >= 65) return 'challenge';
  return 'balanced';
};

export const createAdaptiveProfile = (profile = {}) => {
  const normalizedScore = clamp(Number(profile.score ?? 50), 0, 100);
  const recentResults = Array.isArray(profile.recentResults) ? profile.recentResults.slice(-6) : [];
  const streak = Number.isFinite(profile.streak) ? profile.streak : 0;

  return {
    score: normalizedScore,
    tier: getAdaptiveTier(normalizedScore),
    streak,
    lastAccuracy: profile.lastAccuracy ?? null,
    updatedAt: profile.updatedAt ?? null,
    recentResults,
    lastMetrics: profile.lastMetrics ?? null,
  };
};

const resolveAccuracy = (metrics = {}) => {
  const direct = metrics.accuracy ?? metrics.pct ?? metrics.percent;
  if (Number.isFinite(direct)) return clamp(Math.round(direct), 0, 100);

  const correct = metrics.correct ?? metrics.score;
  const total = metrics.total ?? metrics.totalQuestions ?? metrics.answered ?? metrics.totalPairs;
  if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) {
    return clamp(Math.round((correct / total) * 100), 0, 100);
  }

  return 0;
};

const resolveMistakes = (metrics = {}) => (
  metrics.mistakes
  ?? metrics.wrongAttempts
  ?? metrics.totalWrong
  ?? metrics.wrong
  ?? null
);

const resolveAttempts = (metrics = {}) => (
  metrics.totalAttempts
  ?? metrics.total
  ?? metrics.totalQuestions
  ?? metrics.answered
  ?? metrics.moves
  ?? null
);

const resolveAverageResponseMs = (metrics = {}) => (
  metrics.avgResponseMs
  ?? metrics.averageResponseMs
  ?? metrics.responseMs
  ?? null
);

export const updateAdaptiveProfile = (profile, metrics = {}) => {
  const current = createAdaptiveProfile(profile);
  const accuracy = resolveAccuracy(metrics);
  const mistakes = resolveMistakes(metrics);
  const attempts = resolveAttempts(metrics);
  const averageResponseMs = resolveAverageResponseMs(metrics);
  const targetResponseMs = metrics.targetResponseMs ?? null;

  let delta = 0;
  if (accuracy >= 92) delta += 12;
  else if (accuracy >= 80) delta += 7;
  else if (accuracy >= 65) delta += 2;
  else if (accuracy <= 40) delta -= 12;
  else if (accuracy <= 55) delta -= 7;

  if (Number.isFinite(mistakes) && Number.isFinite(attempts) && attempts > 0) {
    const mistakeRate = mistakes / attempts;
    if (mistakeRate >= 0.45) delta -= 4;
    else if (mistakeRate <= 0.15) delta += 3;
  }

  if (Number.isFinite(averageResponseMs) && Number.isFinite(targetResponseMs) && targetResponseMs > 0) {
    const pace = averageResponseMs / targetResponseMs;
    if (pace <= 0.75) delta += 3;
    else if (pace >= 1.35) delta -= 3;
  }

  let streak = current.streak;
  if (accuracy >= 80) streak += 1;
  else if (accuracy <= 55) streak -= 1;
  else if (streak > 0) streak -= 1;
  else if (streak < 0) streak += 1;

  streak = clamp(streak, -3, 3);
  if (streak >= 2) delta += 2;
  else if (streak <= -2) delta -= 2;

  const score = clamp(current.score + delta, 0, 100);
  const tier = getAdaptiveTier(score);
  const timestamp = new Date();
  const result = {
    accuracy,
    mistakes,
    attempts,
    averageResponseMs,
    timestamp,
  };

  return {
    ...current,
    score,
    tier,
    streak,
    lastAccuracy: accuracy,
    updatedAt: timestamp,
    recentResults: [...current.recentResults, result].slice(-6),
    lastMetrics: {
      ...metrics,
      accuracy,
      mistakes,
      attempts,
      averageResponseMs,
    },
  };
};