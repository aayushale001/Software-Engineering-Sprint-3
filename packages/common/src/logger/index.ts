import pino from "pino";

export const createLogger = (service: string) => {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? "info",
    base: {
      service
    }
  });
};
