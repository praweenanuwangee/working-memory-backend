import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';

const startServer = async () => {
  console.log('\n🚀 Starting Working Memory Backend...');
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Node version: ${process.version}`);
  
  await connectDatabase(env.mongoUri, env.dnsServers);

  const app = createApp({ clientUrl: env.clientUrl });
  app.listen(env.port, () => {
    const baseUrl = `http://localhost:${env.port}`;
    console.log(`\n✅ Server running successfully!`);
    console.log(`   URL: ${baseUrl}`);
    console.log(`   API: ${baseUrl}/api/v1`);
    console.log(`   Health: ${baseUrl}/api/v1/health`);
    console.log(`   CORS: ${env.clientUrl}`);
    console.log('\n📚 Available endpoints:');
    console.log('   GET    /api/v1/health');
    console.log('   GET    /api/v1/working-memory/games');
    console.log('   GET    /api/v1/working-memory/progress');
    console.log('   POST   /api/v1/working-memory/progress/:gameId/initialize');
    console.log('   GET    /api/v1/working-memory/progress/:gameId');
    console.log('   POST   /api/v1/working-memory/progress/:gameId/result');
    console.log('');
  });
};

startServer().catch((error) => {
  console.error('\n❌ Failed to start working memory backend');
  console.error(error.message);
  process.exit(1);
});