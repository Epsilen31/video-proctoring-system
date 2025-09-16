import mongoose from 'mongoose';

import { env, isDev } from './env';

let connectionPromise: Promise<typeof mongoose> | null = null;
let memoryServer: unknown | null = null;

const connectWithUri = async (uri: string) =>
  mongoose.connect(uri, {
    autoIndex: isDev,
  });

export const connectDatabase = async (): Promise<typeof mongoose> => {
  if (connectionPromise) {
    return connectionPromise;
  }

  mongoose.set('strictQuery', true);

  // First, try the configured URI
  try {
    connectionPromise = connectWithUri(env.MONGO_URL);
    return await connectionPromise;
  } catch (err) {
    connectionPromise = null;
    if (!isDev && !env.MONGO_INMEMORY) {
      throw err;
    }
  }

  // Optional: fallback to an in-memory MongoDB for local/dev usage
  if (isDev || env.MONGO_INMEMORY) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    memoryServer = mem;
    const uri = mem.getUri();
    connectionPromise = connectWithUri(uri).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  if (!connectionPromise) {
    throw new Error('Failed to establish MongoDB connection');
  }
  return connectionPromise;
};

export const stopDatabase = async (): Promise<void> => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  } finally {
    if (memoryServer && typeof (memoryServer as any).stop === 'function') {
      await (memoryServer as any).stop();
      memoryServer = null;
    }
    connectionPromise = null;
  }
};
