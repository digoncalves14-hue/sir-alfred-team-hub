import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getPool } from "./client";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, "../migrations");

/** Executa as migrações SQL pendentes, em ordem, dentro de transações. */
export async function migrate(): Promise<string[]> {
  const pool = getPool();
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await pool.query<{ name: string }>("SELECT name FROM _migrations")).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sqlText = await readFile(path.join(dir, f), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const stmt of sqlText.split("--> statement-breakpoint")) {
        if (stmt.trim()) await client.query(stmt);
      }
      await client.query("INSERT INTO _migrations(name) VALUES ($1)", [f]);
      await client.query("COMMIT");
      applied.push(f);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Falha na migração ${f}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate()
    .then((a) => console.log(a.length ? `Migrações aplicadas: ${a.join(", ")}` : "Banco já está atualizado."))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
