import dotenv from 'dotenv';

dotenv.config();

const requiredKeys = ['MONGODB_URI'];

for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Support comma-separated CLIENT_URLS (multi-origin) or a single CLIENT_URL
const resolveClientUrls = () => {
  const raw = process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173';
  return raw
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  // Legacy single-origin (kept for backward compat)
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // Multi-origin array (preferred)
  clientUrls: resolveClientUrls(),
  mongoUri: process.env.MONGODB_URI,
  dnsServers: (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean),
};