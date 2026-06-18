import mongoose from 'mongoose';

const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const healthCheck = async (req, res) => {
  const dbState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const dbStateLabels = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const dbConnected = dbState === 1;

  const mem = process.memoryUsage();

  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected ? 'Working memory backend is running' : 'Database not connected',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    database: {
      state: dbStateLabels[dbState] ?? 'unknown',
      connected: dbConnected,
      name: mongoose.connection.name || null,
    },
    memory: {
      heapUsed: formatBytes(mem.heapUsed),
      heapTotal: formatBytes(mem.heapTotal),
      rss: formatBytes(mem.rss),
    },
  });
};