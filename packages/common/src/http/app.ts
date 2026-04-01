import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { ApiError } from "./errors.js";

export const createServiceApp = (serviceName: string, frontendOrigin: string): Express => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: frontendOrigin,
      credentials: true
    })
  );
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.url.startsWith("/api/v1/")) {
      req.url = req.url.slice("/api/v1".length);
    }
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).json({
      service: serviceName,
      status: "ok"
    });
  });

  queueMicrotask(() => {
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          error: error.message
        });
        return;
      }

      if (error instanceof Error) {
        res.status(500).json({
          error: error.message
        });
        return;
      }

      res.status(500).json({
        error: "Unknown error"
      });
    });
  });

  return app;
};
