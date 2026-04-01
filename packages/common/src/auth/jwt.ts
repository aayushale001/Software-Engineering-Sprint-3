import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { ApiError } from "../http/errors.js";

export type AuthRole = "patient" | "doctor" | "admin";

export type RequestWithAuth = Request & {
  auth?: {
    userId: string;
    role: AuthRole;
    email: string;
    patientId: string | null;
    staffUserId: string | null;
    doctorId: string | null;
  };
};

export type AuthClaims = JwtPayload & {
  sub: string;
  role: AuthRole;
  email: string;
  iss: string;
  tokenType: "access" | "refresh";
  patientId?: string;
  staffUserId?: string;
  doctorId?: string;
};

export const signAccessToken = (
  claims: {
    subjectId: string;
    email: string;
    role: AuthRole;
    patientId?: string | null;
    staffUserId?: string | null;
    doctorId?: string | null;
  },
  secret: string,
  issuer = "patient-auth"
): string => {
  const patientId = claims.role === "patient" ? (claims.patientId ?? claims.subjectId) : undefined;
  const staffUserId = claims.role !== "patient" ? (claims.staffUserId ?? claims.subjectId) : undefined;

  return jwt.sign(
    {
      sub: claims.subjectId,
      role: claims.role,
      email: claims.email,
      iss: issuer,
      tokenType: "access",
      patientId,
      staffUserId,
      doctorId: claims.doctorId ?? undefined
    },
    secret,
    { expiresIn: "15m" }
  );
};

export const signRefreshToken = (
  claims: {
    subjectId: string;
    email: string;
    role: AuthRole;
    patientId?: string | null;
    staffUserId?: string | null;
    doctorId?: string | null;
  },
  secret: string,
  issuer = "patient-auth"
): string => {
  const patientId = claims.role === "patient" ? (claims.patientId ?? claims.subjectId) : undefined;
  const staffUserId = claims.role !== "patient" ? (claims.staffUserId ?? claims.subjectId) : undefined;

  return jwt.sign(
    {
      sub: claims.subjectId,
      role: claims.role,
      email: claims.email,
      iss: issuer,
      tokenType: "refresh",
      patientId,
      staffUserId,
      doctorId: claims.doctorId ?? undefined
    },
    secret,
    { expiresIn: "7d" }
  );
};

export const verifyToken = (token: string, secret: string, issuer?: string): AuthClaims => {
  return jwt.verify(token, secret, issuer ? { issuer } : undefined) as AuthClaims;
};

export const extractBearerToken = (authorization?: string): string | null => {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
};

export const extractCookieToken = (cookieHeader: string | undefined, cookieName: string): string | null => {
  if (!cookieHeader) {
    return null;
  }

  const cookieEntries = cookieHeader.split(";").map((entry) => entry.trim());
  for (const entry of cookieEntries) {
    const [name, value] = entry.split("=");
    if (name === cookieName && value) {
      return decodeURIComponent(value);
    }
  }

  return null;
};

const toAuthContext = (claims: AuthClaims) => {
  return {
    userId: claims.sub,
    role: claims.role,
    email: claims.email,
    patientId: claims.role === "patient" ? (claims.patientId ?? claims.sub) : null,
    staffUserId: claims.role === "patient" ? null : (claims.staffUserId ?? claims.sub),
    doctorId: claims.doctorId ?? null
  };
};

export const requireAuth = (secret: string, issuer?: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req.headers.authorization) ?? extractCookieToken(req.headers.cookie, "access_token");

    if (!token) {
      next(new ApiError(401, "Missing access token"));
      return;
    }

    try {
      const claims = verifyToken(token, secret, issuer);
      if (claims.tokenType !== "access") {
        next(new ApiError(401, "Invalid token"));
        return;
      }

      (req as RequestWithAuth).auth = toAuthContext(claims);
      next();
    } catch {
      next(new ApiError(401, "Invalid token"));
    }
  };
};

export const requireRoles = (secret: string, roles: AuthRole[], issuer?: string) => {
  const allowed = new Set(roles);

  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(secret, issuer)(req, res, (error?: unknown) => {
      if (error) {
        next(error as Error);
        return;
      }

      const auth = (req as RequestWithAuth).auth;
      if (!auth || !allowed.has(auth.role)) {
        next(new ApiError(403, "Forbidden"));
        return;
      }

      next();
    });
  };
};

export const requirePatientAuth = (secret: string, issuer?: string) => {
  return requireRoles(secret, ["patient"], issuer);
};
