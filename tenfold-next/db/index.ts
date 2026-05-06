import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Disable prefetch for serverless edge environments
const client = postgres(connectionString, {
  prepare: false,   // required for transaction pooler
  ssl: 'require',   // Supabase always requires SSL
  max: 1,           // serverless: one connection per function instance
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type DrizzleClient = typeof db;
