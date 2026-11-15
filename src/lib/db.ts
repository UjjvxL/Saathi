import "server-only";
import mongoose from "mongoose";
import { env } from "./env";

type ConnectionCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Reuse one connection across hot reloads in development and across requests in production.
const globalForMongoose = globalThis as unknown as { __saathiMongoose?: ConnectionCache };
const cache: ConnectionCache = globalForMongoose.__saathiMongoose ?? { conn: null, promise: null };
globalForMongoose.__saathiMongoose = cache;

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(env.mongoUri(), {
      dbName: env.mongoDbName(),
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
  }
  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
  return cache.conn;
}

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 11000;
}
