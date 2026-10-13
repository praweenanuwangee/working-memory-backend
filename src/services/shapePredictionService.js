import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../utils/ApiError.js';

const scriptPath = fileURLToPath(new URL('../../ml/predict.py', import.meta.url));
let activePrediction = false;

// Local CLI only: a single CPU inference at a time bounds memory use.
export const runPrediction = (imagePath) => {
  if (process.env.VERCEL === '1') {
    throw new ApiError(503, 'Prediction must be routed to the Python Function');
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
