import { createClient } from "redis";

type CacheClient = ReturnType<typeof createClient>;

const redisClientCache = new Map<string, CacheClient>();

export const getRedisClient = async (redisUrl: string): Promise<CacheClient> => {
  const cached = redisClientCache.get(redisUrl);
  if (cached && cached.isOpen) {
    return cached;
  }

  const client = createClient({
    url: redisUrl
  });

  client.on("error", (error) => {
    console.error("Redis error", error);
  });

  await client.connect();
  redisClientCache.set(redisUrl, client);
  return client;
};
