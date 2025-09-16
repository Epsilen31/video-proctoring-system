import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGO_URL: z
    .string()
    .min(1, 'MONGO_URL is required')
    .default('mongodb://localhost:27017/focusproctor'),
  // When true, use an in-memory MongoDB for local/dev if connection fails or is not desired
  MONGO_INMEMORY: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true')
    .pipe(z.boolean().default(false)),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required').default('devsecret'),
  CORS_ORIGIN: z
    .string()
    .min(1, 'CORS_ORIGIN is required')
    .default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type AppEnvironment = z.infer<typeof envSchema>;

export const env: AppEnvironment = envSchema.parse({
  PORT: process.env.PORT,
  MONGO_URL: process.env.MONGO_URL,
  MONGO_INMEMORY: process.env.MONGO_INMEMORY,
  JWT_SECRET: process.env.JWT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
});

export const isDev = env.NODE_ENV === 'development';
