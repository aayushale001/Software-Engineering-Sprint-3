export const makeAvailabilityCacheKey = (doctorId: string, start: string, end: string): string => {
  return `availability:${doctorId}:${start}:${end}`;
};

export const invalidateDoctorAvailabilityCache = async (
  redis: { keys: (pattern: string) => Promise<string[]>; del: (keys: string | string[]) => Promise<number> },
  doctorId: string
): Promise<void> => {
  const pattern = `availability:${doctorId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(keys);
  }
};
