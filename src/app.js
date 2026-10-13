
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import healthRoutes from './routes/healthRoutes.js';
import workingMemoryRoutes from './routes/workingMemoryRoutes.js';

import {
  errorHandler,
  notFoundHandler,
} from './middleware/errorHandler.js';

export const createApp = ({ clientUrls = [] }) => {
  const app = express();

  // ============================================================
  // CORS CONFIGURATION
  // ============================================================

  const configuredOrigins = Array.isArray(clientUrls)
    ? clientUrls
    : [clientUrls];

  const allowedOrigins = [
    ...configuredOrigins,
    'http://localhost:5173',
    'https://localhost:5173',
  ]
    .filter(Boolean)
    .map((origin) => origin.trim().replace(/\/$/, ''));

  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        console.error('CORS blocked origin:', origin);
        return callback(new Error('Not allowed by CORS'));
      },

      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-user-id',
      ],

      credentials: false,
    })
  );

  // ============================================================
  // MIDDLEWARE
  // ============================================================

  app.use(morgan('dev'));

  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    console.log('Incoming Route:', req.originalUrl);
    next();
  });

  // ============================================================
  // ROOT API
  // ============================================================

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

  // ============================================================
  // ROUTES
  // ============================================================

  app.use('/api/health', healthRoutes);

  app.use('/api/working-memory', workingMemoryRoutes);

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  app.use(notFoundHandler);

  app.use(errorHandler);

  return app;
};
