import mongoose from 'mongoose';

const recentResultSchema = new mongoose.Schema(
  {
    accuracy: { type: Number, default: 0 },
    mistakes: { type: Number, default: null },
    attempts: { type: Number, default: null },
    averageResponseMs: { type: Number, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const adaptiveProfileSchema = new mongoose.Schema(
  {
    score: { type: Number, default: 50 },
    tier: { type: String, enum: ['support', 'balanced', 'challenge'], default: 'balanced' },
    streak: { type: Number, default: 0 },
    lastAccuracy: { type: Number, default: null },
    updatedAt: { type: Date, default: null },
    recentResults: { type: [recentResultSchema], default: [] },
    lastMetrics: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const workingMemoryProgressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, trim: true },
    gameId: { type: String, required: true, trim: true },
    currentLevel: { type: Number, default: 1, min: 1 },
    completedLevels: { type: [Number], default: [] },
    unlockedLevels: { type: [Number], default: [1] },
    levelStats: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    levelProgress: { type: Map, of: Number, default: {} },
    adaptiveProfile: { type: adaptiveProfileSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

workingMemoryProgressSchema.index({ userId: 1, gameId: 1 }, { unique: true });

export const WorkingMemoryProgress = mongoose.model('WorkingMemoryProgress', workingMemoryProgressSchema);