import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import healthRoutes from './routes/healthRoutes.js';
import workingMemoryRoutes from './routes/workingMemoryRoutes.js';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export const createApp = ({ clientUrls = [] }) => {
  const app = express();

  // Normalize to array; accept a single string or an array
  const allowedOrigins = Array.isArray(clientUrls)
    ? clientUrls
    : [clientUrls];

  app.use(helmet());

  app.use(
    cors({
      origin:
        allowedOrigins.length === 1
          ? allowedOrigins[0]
          : allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-user-id'],
      credentials: false,
    }),
  );

  app.use(morgan('dev'));
  app.use(express.json({ limit: '1mb' }));

  // Root API
  app.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Working Memory Backend API',
      docs: {
        health: '/api/health',
        workingMemory: '/api/working-memory',
      },
    });
  });

  // Routes
  app.use('/api/health', healthRoutes);
  app.use('/api/working-memory', workingMemoryRoutes);

  // Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};