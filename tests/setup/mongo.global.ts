// Starts one throwaway MongoDB for the whole integration run (each test file gets its own database).
import { MongoMemoryServer } from "mongodb-memory-server-core";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

export default async function setup(project: TestProject) {
  // CI can point at a real MongoDB service instead of downloading one.
  const external = process.env.MONGODB_TEST_URI;
  if (external) {
    project.provide("mongoUri", external);
    return;
  }
  const server = await MongoMemoryServer.create();
  project.provide("mongoUri", server.getUri());
  return async () => {
    await server.stop();
  };
}
