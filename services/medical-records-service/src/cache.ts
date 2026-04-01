export const makeRecordsCacheKey = (
  patientId: string,
  filters: { from?: string; to?: string; type?: string; limit: number; offset: number }
): string => {
  return `records:${patientId}:${filters.from ?? ""}:${filters.to ?? ""}:${filters.type ?? ""}:${filters.limit}:${filters.offset}`;
};

export const invalidatePatientRecordsCache = async (
  redis: { keys: (pattern: string) => Promise<string[]>; del: (keys: string | string[]) => Promise<number> },
  patientId: string
): Promise<void> => {
  const keys = await redis.keys(`records:${patientId}:*`);
  if (keys.length > 0) {
    await redis.del(keys);
  }
};
