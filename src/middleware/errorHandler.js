import { ApiError } from '../utils/ApiError.js';
import multer from 'multer';

export const notFoundHandler = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const uploadError = error instanceof multer.MulterError;
  const statusCode = uploadError
    ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
    : (error.statusCode || error.status || 500);
  const message = uploadError
    ? (error.code === 'LIMIT_FILE_SIZE' ? 'Image must be no larger than 4 MB' : 'Invalid image upload')
    : (error instanceof ApiError ? error.message : (statusCode < 500 ? 'Invalid request' : 'Internal server error'));

  if (process.env.NODE_ENV !== 'test') {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message,
    details: error instanceof ApiError ? error.details : undefined,
  });
};
