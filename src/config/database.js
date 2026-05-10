import dns from 'node:dns';
import mongoose from 'mongoose';

export const connectDatabase = async (mongoUri, dnsServers = []) => {
  console.log('\n📡 Connecting to MongoDB...');
  
  if (dnsServers.length > 0) {
    console.log(`   Using DNS servers: ${dnsServers.join(', ')}`);
    dns.setServers(dnsServers);
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    
    const dbName = mongoose.connection.name || 'working-memory-backend';
    console.log(`✅ MongoDB connected successfully`);
    console.log(`   Database: ${dbName}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed');
    throw error;
  }
};