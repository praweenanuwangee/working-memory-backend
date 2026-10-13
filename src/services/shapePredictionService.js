import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../utils/ApiError.js';
import { readFile } from 'node:fs/promises';

const scriptPath = fileURLToPath(new URL('../../ml/predict.py', import.meta.url));
let activePrediction = false;

// Local CLI only: a single CPU inference at a time bounds memory use.
export const runPrediction = (imagePath, image = {}) => {
  if (process.env.ML_SERVICE_URL) return runBoundPrediction(imagePath, image);
  if (process.env.VERCEL === '1') {
    throw new ApiError(503, 'Internal ML service binding is unavailable');
  }
  if (activePrediction) throw new ApiError(503, 'Shape prediction is busy; please try again');
  const timeout = Number(process.env.PREDICTION_TIMEOUT_MS || 60000);
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 300000) {
    throw new ApiError(503, 'Shape prediction timeout is not configured correctly');
  }
  activePrediction = true;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3'),
        ['-u', scriptPath, imagePath], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      activePrediction = false;
      return reject(new ApiError(503, 'Python prediction runtime unavailable'));
    }
    let stdout = '';
    let stderr = '';
    let failure;
    const stop = (error) => { failure ||= error; child.kill('SIGKILL'); };
    const timer = setTimeout(() => stop(new ApiError(504, 'Shape prediction timed out')), timeout);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (failure) return;
      stdout += chunk;
      if (stdout.length > 65536) stop(new ApiError(502, 'Invalid prediction output'));
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8192); });
    child.on('error', () => { failure ||= new ApiError(503, 'Python prediction runtime unavailable'); });
    child.on('close', (code) => {
      clearTimeout(timer);
      activePrediction = false;
      if (failure) return reject(failure);
      if (code !== 0) {
        if (process.env.NODE_ENV !== 'test') console.error('Python prediction failed:', stderr);
        return reject(new ApiError(code === 2 ? 400 : 500,
          code === 2 ? 'Invalid image data' : 'Shape prediction failed'));
      }
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new ApiError(502, 'Invalid prediction output')); }
    });
  });
};

const runBoundPrediction = async (imagePath, image) => {
  const timeout = Number(process.env.PREDICTION_TIMEOUT_MS || 60000);
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 110000) {
    throw new ApiError(503, 'Shape prediction timeout is not configured correctly');
  }
  let url;
  try {
    const base = process.env.ML_SERVICE_URL;
    url = new URL('predict-shape', base.endsWith('/') ? base : `${base}/`);
  } catch {
    throw new ApiError(503, 'Internal ML service binding is invalid');
  }
  const form = new FormData();
  form.append('image', new Blob([await readFile(imagePath)], {
    type: image.mimetype || 'image/jpeg',
  }), image.originalname || 'shape.jpg');
  try {
    const response = await fetch(url, {
      method: 'POST', body: form, signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const status = [400, 413, 503, 504].includes(response.status) ? response.status : 502;
      throw new ApiError(status, status === 400 ? 'Invalid image data' : 'Shape prediction service failed');
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'TimeoutError') throw new ApiError(504, 'Shape prediction timed out');
    if (error instanceof SyntaxError) throw new ApiError(502, 'Invalid prediction output');
    throw new ApiError(503, 'Internal shape prediction service unavailable');
  }
};
