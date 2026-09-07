import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

const databaseUrl = process.env.DATABASE_URL;
const useRemotePg = Boolean(
  databaseUrl &&
    !databaseUrl.includes("127.0.0.1:5432") &&
    !databaseUrl.includes("localhost:5432")
);

const globalForDb = globalThis as typeof globalThis & {
  __arenaPool?: any;
  __arenaDb?: any;
  __arenaPglite?: PGlite;
};

let rawDb: any;
let rawPool: any;

if (useRemotePg) {
  rawPool =
    globalForDb.__arenaPool ??
    new Pool({
      connectionString: databaseUrl,
      ssl:
        databaseUrl && !databaseUrl.includes("127.0.0.1") && !databaseUrl.includes("localhost")
          ? { rejectUnauthorized: false }
          : undefined,
    });
  rawDb = globalForDb.__arenaDb ?? drizzleNodePg(rawPool);
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaPool = rawPool;
    globalForDb.__arenaDb = rawDb;
  }
} else {
  let pglite = globalForDb.__arenaPglite;
  if (!pglite) {
    try {
      pglite = new PGlite("./.pgdata");
    } catch {
      pglite = new PGlite();
    }
    if (process.env.NODE_ENV !== "production") {
      globalForDb.__arenaPglite = pglite;
    }
  }

  const dialect = new PgDialect();
  const baseDb = drizzlePglite(pglite);

  rawDb =
    globalForDb.__arenaDb ??
    new Proxy(baseDb, {
      get(target, prop, receiver) {
        if (prop === "execute") {
          return async (query: any) => {
            try {
              const converted = dialect.sqlToQuery(query);
              return await pglite.exec(converted.sql);
            } catch {
              return target.execute(query);
            }
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

  rawPool =
    globalForDb.__arenaPool ??
    {
      connect: async () => ({
        query: async (queryText: string, params?: any[]) => {
          const res = await pglite.query(queryText, params);
          return { rows: res.rows, rowCount: res.rowCount, fields: res.fields };
        },
        release: () => {},
      }),
      query: async (queryText: string, params?: any[]) => {
        const res = await pglite.query(queryText, params);
        return { rows: res.rows, rowCount: res.rowCount, fields: res.fields };
      },
      end: async () => {},
    };

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaDb = rawDb;
    globalForDb.__arenaPool = rawPool;
  }
}

export const pool = rawPool as unknown as Pool;
export const db = rawDb as unknown as NodePgDatabase<Record<string, never>>;
