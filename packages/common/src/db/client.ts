import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const poolCache = new Map<string, Pool>();

export const getPgPool = (databaseUrl: string): Pool => {
  const cached = poolCache.get(databaseUrl);
  if (cached) {
    return cached;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 10_000
  });

  poolCache.set(databaseUrl, pool);
  return pool;
};

export const runQuery = async <T extends QueryResultRow>(
  pool: Pool,
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> => {
  return pool.query<T>(sql, params);
};

export const withTransaction = async <T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
