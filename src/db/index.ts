import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { Pool, types as pgTypes } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { resolveDatabaseConfig } from "./config";

const databaseConfig = resolveDatabaseConfig();

// Existing schema uses TIMESTAMP WITHOUT TIME ZONE. Treat it as UTC
// consistently instead of allowing node-postgres to apply the host timezone.
pgTypes.setTypeParser(1114, (value: string) => new Date(`${value.replace(" ", "T")}Z`));

const globalForDb = globalThis as typeof globalThis & {
  __arenaPool?: any;
  __arenaDb?: any;
  __arenaPglite?: PGlite;
};

let rawDb: any;
let rawPool: any;

if (databaseConfig.driver === "postgres") {
  rawPool =
    globalForDb.__arenaPool ??
    new Pool({
      connectionString: databaseConfig.databaseUrl,
      ssl: databaseConfig.ssl,
      options: "-c timezone=UTC",
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
      pglite = databaseConfig.pgliteDataDir ? new PGlite(databaseConfig.pgliteDataDir) : new PGlite();
    } catch (error) {
      throw new Error("Failed to initialize explicitly configured PGlite database.", { cause: error });
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
export const activeDatabaseDriver = databaseConfig.driver;
