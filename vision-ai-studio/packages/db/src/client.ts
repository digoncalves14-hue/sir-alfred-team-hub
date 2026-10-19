import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __visionPool?: pg.Pool; __visionDb?: Db };

export function getPool(): pg.Pool {
  if (!globalForDb.__visionPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL não configurada.");
    globalForDb.__visionPool = new pg.Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForDb.__visionPool;
}

export function getDb(): Db {
  if (!globalForDb.__visionDb) {
    globalForDb.__visionDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__visionDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__visionPool?.end();
  globalForDb.__visionPool = undefined;
  globalForDb.__visionDb = undefined;
}
