import { PrismaClient } from "@prisma/client";

const globalDb = globalThis as unknown as { synkDb?: PrismaClient };
export const db = globalDb.synkDb ?? new PrismaClient();
globalDb.synkDb = db;
