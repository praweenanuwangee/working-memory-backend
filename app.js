import mongoose from 'mongoose';
import express from 'express';
import { createApp } from './src/app.js';
import { connectDatabase } from './src/config/database.js';
import { env } from './src/config/env.js';
import { ApiError } from './src/utils/ApiError.js';

let connectionPromise;
const databaseMiddleware = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      connectionPromise ||= connectDatabase(env.mongoUri, env.dnsServers)
        .finally(() => { connectionPromise = undefined; });
      await connectionPromise;
    }
    next();
  } catch {
    next(new ApiError(503, 'Database service unavailable'));
  }
};

const app = express();
app.use(createApp({ clientUrls: env.clientUrls, databaseMiddleware }));
export default app;
