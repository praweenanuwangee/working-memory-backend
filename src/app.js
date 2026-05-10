import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import healthRoutes from './routes/healthRoutes.js';
import workingMemoryRoutes from './routes/workingMemoryRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export const createApp = ({ clientUrl }) => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: clientUrl }));
  app.use(morgan('dev'));
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Working memory backend API',
      docs: {
        health: '/api/v1/health',
        workingMemory: '/api/v1/working-memory',
      },
    });
  });

  app.use('/api/v1/health', healthRoutes);
  app.use('/api/v1/working-memory', workingMemoryRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};