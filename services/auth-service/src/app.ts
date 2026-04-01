import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { Pool } from "pg";
import type { Producer } from "kafkajs";

import {
  ApiError,
  asyncHandler,
  createServiceApp,
  publishEventSafely,
  requireRoles,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyToken,
  type AuthRole,
  type RequestWithAuth,
  type ServiceEnv
} from "@hospital/common";
import { KAFKA_TOPICS } from "@hospital/contracts";

import {
  acceptStaffInvite,
  createPatientPasswordResetToken,
  createPatientWithPassword,
  createStaffInvite,
  findPatientByEmail,
  findOrCreatePatientByEmail,
  findPatientWithPasswordByEmail,
  findStaffUserByEmail,
  getRefreshTokenRecord,
  getPatientPasswordResetToken,
  getStaffInviteByToken,
  getStaffRefreshTokenRecord,
  listStaffUsers,
  recordStaffLogin,
  resetPatientPasswordWithToken,
  revokeRefreshToken,
  revokeStaffRefreshToken,
  storeOtpRequest,
  storeRefreshToken,
  storeStaffRefreshToken,
  type StaffUser
} from "./repositories/auth-repository.js";

const PATIENT_PASSWORD_MIN_LENGTH = 12;
const PATIENT_PASSWORD_RESET_TTL_SECONDS = 60 * 60;

const requestOtpSchema = z.object({
  email: z.string().email()
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6)
});

const refreshSchema = z.object({
  refreshToken: z.string().optional()
});

const patientPasswordSchema = z.string().min(PATIENT_PASSWORD_MIN_LENGTH);

const patientSignupSchema = z.object({
  email: z.string().email(),
  password: patientPasswordSchema
});

const patientLoginSchema = z.object({
  email: z.string().email(),
  password: patientPasswordSchema
});

const patientForgotPasswordSchema = z.object({
  email: z.string().email()
});

const patientResetPasswordSchema = z.object({
  token: z.string().min(20),
  password: patientPasswordSchema
});

const googleExchangeSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const staffInviteSchema = z.discriminatedUnion("role", [
  z.object({
    email: z.string().email(),
    role: z.literal("admin")
  }),
  z.object({
    email: z.string().email(),
    role: z.literal("doctor"),
    doctorProfile: z.object({
      fullName: z.string().min(2).max(120),
      specialty: z.string().min(2).max(120),
      timezone: z.string().min(2).max(80),
      bio: z.string().max(2000).optional(),
      phoneNumber: z.string().min(7).max(25).optional()
    })
  })
]);

const acceptStaffInviteSchema = z.object({
  inviteToken: z.string().min(20),
  password: z.string().min(12)
});

type AuthContext = {
  env: ServiceEnv;
  pool: Pool;
  redis: {
    set: (key: string, value: string, options: { EX: number }) => Promise<unknown>;
    get: (key: string) => Promise<string | null>;
    del: (key: string) => Promise<number>;
  };
  producer: Producer;
};

type AuthPatient = {
  id: string;
  email: string;
};

type SessionResponse = {
  accessToken: string;
  refreshToken: string;
  role: AuthRole;
  patientId: string | null;
  staffUserId: string | null;
  doctorId: string | null;
};

const makeOtp = (): string => `${Math.floor(100000 + Math.random() * 900000)}`;
const makeGoogleStateKey = (state: string): string => `oauth:google:state:${state}`;

const resolveRefreshToken = (cookieToken: unknown, bodyToken: unknown): string | null => {
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }
  if (typeof bodyToken === "string" && bodyToken.length > 0) {
    return bodyToken;
  }
  return null;
};

const setSessionCookies = (
  res: { cookie: (name: string, value: string, options: Record<string, unknown>) => void },
  env: ServiceEnv,
  accessToken: string,
  refreshToken: string
) => {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: 15 * 60 * 1000
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
};

const createDoctorProfile = async (
  pool: Pool,
  input: {
    fullName: string;
    specialty: string;
    timezone: string;
    bio?: string;
    phoneNumber?: string;
  }
): Promise<string> => {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO doctor.doctors (full_name, specialty, timezone, bio, phone_number, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING id
    `,
    [input.fullName, input.specialty, input.timezone, input.bio ?? null, input.phoneNumber ?? null]
  );

  return result.rows[0].id;
};

const issuePatientSession = async ({
  env,
  pool,
  producer,
  patient,
  auditEventType,
  metadata
}: {
  env: ServiceEnv;
  pool: Pool;
  producer: Producer;
  patient: AuthPatient;
  auditEventType: string;
  metadata?: Record<string, unknown>;
}): Promise<SessionResponse> => {
  const accessToken = signAccessToken(
    {
      subjectId: patient.id,
      role: "patient",
      email: patient.email,
      patientId: patient.id
    },
    env.jwtAccessSecret,
    env.jwtIssuer
  );
  const refreshToken = signRefreshToken(
    {
      subjectId: patient.id,
      role: "patient",
      email: patient.email,
      patientId: patient.id
    },
    env.jwtRefreshSecret,
    env.jwtIssuer
  );
  const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await Promise.all([
    storeRefreshToken(pool, patient.id, refreshToken, refreshExpiresAt),
    publishEventSafely(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, patient.id, {
      eventType: auditEventType,
      actorType: "patient",
      actorId: patient.id,
      metadata,
      occurredAt: new Date().toISOString()
    })
  ]);

  return {
    accessToken,
    refreshToken,
    role: "patient",
    patientId: patient.id,
    staffUserId: null,
    doctorId: null
  };
};

const issueStaffSession = async ({
  env,
  pool,
  producer,
  staffUser,
  auditEventType,
  metadata
}: {
  env: ServiceEnv;
  pool: Pool;
  producer: Producer;
  staffUser: StaffUser;
  auditEventType: string;
  metadata?: Record<string, unknown>;
}): Promise<SessionResponse> => {
  const accessToken = signAccessToken(
    {
      subjectId: staffUser.id,
      role: staffUser.role,
      email: staffUser.email,
      staffUserId: staffUser.id,
      doctorId: staffUser.doctorId
    },
    env.jwtAccessSecret,
    env.jwtIssuer
  );
  const refreshToken = signRefreshToken(
    {
      subjectId: staffUser.id,
      role: staffUser.role,
      email: staffUser.email,
      staffUserId: staffUser.id,
      doctorId: staffUser.doctorId
    },
    env.jwtRefreshSecret,
    env.jwtIssuer
  );
  const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await Promise.all([
    storeStaffRefreshToken(pool, staffUser.id, refreshToken, refreshExpiresAt),
    recordStaffLogin(pool, staffUser.id),
    publishEventSafely(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, staffUser.id, {
      eventType: auditEventType,
      actorType: staffUser.role,
      actorId: staffUser.id,
      metadata,
      occurredAt: new Date().toISOString()
    })
  ]);

  return {
    accessToken,
    refreshToken,
    role: staffUser.role,
    patientId: null,
    staffUserId: staffUser.id,
    doctorId: staffUser.doctorId
  };
};

const getGoogleAuthorizationUrl = (env: ServiceEnv, state: string): string => {
  if (!env.googleOAuthEnabled || !env.googleOAuthClientId || !env.googleOAuthRedirectUri) {
    throw new ApiError(503, "Google OAuth is not configured");
  }

  const params = new URLSearchParams({
    client_id: env.googleOAuthClientId,
    redirect_uri: env.googleOAuthRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const exchangeGoogleCodeForAccessToken = async (env: ServiceEnv, code: string): Promise<string> => {
  if (!env.googleOAuthClientId || !env.googleOAuthClientSecret || !env.googleOAuthRedirectUri) {
    throw new ApiError(503, "Google OAuth is not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: env.googleOAuthClientId,
      client_secret: env.googleOAuthClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.googleOAuthRedirectUri
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new ApiError(401, payload.error_description ?? payload.error ?? "Google OAuth token exchange failed");
  }

  return payload.access_token;
};

const fetchGoogleProfile = async (accessToken: string): Promise<{ email: string; name?: string }> => {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = (await response.json().catch(() => ({}))) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (!response.ok || !payload.email) {
    throw new ApiError(401, "Google OAuth profile lookup failed");
  }

  if (!payload.email_verified) {
    throw new ApiError(401, "Google account email is not verified");
  }

  return {
    email: payload.email,
    name: payload.name
  };
};

const buildInviteUrl = (env: ServiceEnv, inviteToken: string): string => {
  const url = new URL("/staff/invite", env.frontendOrigin);
  url.searchParams.set("token", inviteToken);
  return url.toString();
};

const buildPatientResetUrl = (env: ServiceEnv, resetToken: string): string => {
  const url = new URL("/reset-password", env.frontendOrigin);
  url.searchParams.set("token", resetToken);
  return url.toString();
};

const ensureUsableResetToken = (record: Awaited<ReturnType<typeof getPatientPasswordResetToken>>) => {
  if (!record) {
    throw new ApiError(404, "Reset link is invalid");
  }

  if (record.status !== "active") {
    throw new ApiError(403, "Patient account is inactive");
  }

  if (record.consumedAt) {
    throw new ApiError(409, "Reset link has already been used");
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(410, "Reset link has expired");
  }

  return record;
};

export const createAuthApp = ({ env, pool, redis, producer }: AuthContext) => {
  const app = createServiceApp("auth-service", env.frontendOrigin);
  app.use(cookieParser());

  app.post(
    "/auth/patient/signup",
    asyncHandler(async (req, res) => {
      const { email, password } = patientSignupSchema.parse(req.body);
      const existing = await findPatientByEmail(pool, email);
      if (existing) {
        throw new ApiError(409, "An account already exists for this email. Log in or reset your password.");
      }

      const patient = await createPatientWithPassword(pool, email, password);
      const session = await issuePatientSession({
        env,
        pool,
        producer,
        patient,
        auditEventType: "auth.patient.signup",
        metadata: {
          email,
          provider: "password"
        }
      });

      setSessionCookies(res, env, session.accessToken, session.refreshToken);
      res.status(201).json(session);
    })
  );

  app.post(
    "/auth/patient/login",
    asyncHandler(async (req, res) => {
      const { email, password } = patientLoginSchema.parse(req.body);
      const patient = await findPatientWithPasswordByEmail(pool, email);

      if (!patient || !patient.passwordHash) {
        throw new ApiError(401, "Invalid patient credentials");
      }

      if (patient.status !== "active") {
        throw new ApiError(403, "Patient account is inactive");
      }

      const matches = await verifyPassword(password, patient.passwordHash);
      if (!matches) {
        throw new ApiError(401, "Invalid patient credentials");
      }

      const session = await issuePatientSession({
        env,
        pool,
        producer,
        patient,
        auditEventType: "auth.patient.password.login",
        metadata: {
          email,
          provider: "password"
        }
      });

      setSessionCookies(res, env, session.accessToken, session.refreshToken);
      res.status(200).json(session);
    })
  );

  app.post(
    "/auth/patient/forgot-password",
    asyncHandler(async (req, res) => {
      const { email } = patientForgotPasswordSchema.parse(req.body);
      const patient = await findPatientByEmail(pool, email);

      if (patient && patient.status === "active") {
        const reset = await createPatientPasswordResetToken(pool, patient.id, PATIENT_PASSWORD_RESET_TTL_SECONDS);
        const resetUrl = buildPatientResetUrl(env, reset.resetToken);

        await Promise.all([
          publishEventSafely(producer, KAFKA_TOPICS.NOTIFICATION_REQUESTED, patient.id, {
            notificationId: uuidv4(),
            channel: "email",
            destination: patient.email,
            template: "patient_password_reset",
            data: {
              resetUrl,
              expiresInSeconds: PATIENT_PASSWORD_RESET_TTL_SECONDS
            },
            requestedAt: new Date().toISOString()
          }),
          publishEventSafely(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, patient.id, {
            eventType: "auth.patient.password.reset.requested",
            actorType: "patient",
            actorId: patient.id,
            metadata: {
              email: patient.email
            },
            occurredAt: new Date().toISOString()
          })
        ]);
      }

      res.status(202).json({
        message: "If an account exists for this email, a reset link has been sent."
      });
    })
  );

  app.get(
    "/auth/patient/reset-password/:token",
    asyncHandler(async (req, res) => {
      const token = req.params.token;
      if (typeof token !== "string") {
        throw new ApiError(400, "Invalid reset token");
      }

      const record = ensureUsableResetToken(await getPatientPasswordResetToken(pool, token));

      res.status(200).json({
        email: record.email,
        expiresAt: record.expiresAt.toISOString()
      });
    })
  );

  app.post(
    "/auth/patient/reset-password",
    asyncHandler(async (req, res) => {
      const { token, password } = patientResetPasswordSchema.parse(req.body);
      ensureUsableResetToken(await getPatientPasswordResetToken(pool, token));

      const patient = await resetPatientPasswordWithToken(pool, token, password);
      const session = await issuePatientSession({
        env,
        pool,
        producer,
        patient,
        auditEventType: "auth.patient.password.reset.completed",
        metadata: {
          email: patient.email,
          provider: "password"
        }
      });

      setSessionCookies(res, env, session.accessToken, session.refreshToken);
      res.status(200).json(session);
    })
  );

  app.get(
    "/auth/google/url",
    asyncHandler(async (_req, res) => {
      if (!env.googleOAuthEnabled) {
        throw new ApiError(503, "Google OAuth is not configured");
      }

      const state = uuidv4();
      await redis.set(makeGoogleStateKey(state), "pending", {
        EX: env.googleOAuthStateTtlSeconds
      });

      res.status(200).json({
        authorizationUrl: getGoogleAuthorizationUrl(env, state)
      });
    })
  );

  app.post(
    "/auth/google/exchange",
    asyncHandler(async (req, res) => {
      if (!env.googleOAuthEnabled) {
        throw new ApiError(503, "Google OAuth is not configured");
      }

      const { code, state } = googleExchangeSchema.parse(req.body);
      const stateKey = makeGoogleStateKey(state);
      const cachedState = await redis.get(stateKey);
      if (!cachedState) {
        throw new ApiError(401, "Google OAuth state is invalid or expired");
      }

      await redis.del(stateKey);

      const googleAccessToken = await exchangeGoogleCodeForAccessToken(env, code);
      const googleProfile = await fetchGoogleProfile(googleAccessToken);
      const patient = await findOrCreatePatientByEmail(pool, googleProfile.email, {
        fullName: googleProfile.name
      });

      const session = await issuePatientSession({
        env,
        pool,
        producer,
        patient,
        auditEventType: "auth.google.oauth.verified",
        metadata: {
          email: googleProfile.email,
          provider: "google"
        }
      });

      setSessionCookies(res, env, session.accessToken, session.refreshToken);
      res.status(200).json(session);
    })
  );

  app.post(
    "/auth/request-otp",
    asyncHandler(async (req, res) => {
      const { email } = requestOtpSchema.parse(req.body);
      const otp = makeOtp();

      await Promise.all([
        redis.set(`otp:${email}`, otp, { EX: env.otpTtlSeconds }),
        storeOtpRequest(pool, email),
        publishEventSafely(producer, KAFKA_TOPICS.NOTIFICATION_REQUESTED, email, {
          notificationId: uuidv4(),
          channel: "email",
          destination: email,
          template: "otp_login",
          data: {
            otp,
            expiresInSeconds: env.otpTtlSeconds
          },
          requestedAt: new Date().toISOString()
        })
      ]);

      res.status(202).json({
        message: "OTP generated",
        expiresInSeconds: env.otpTtlSeconds,
        ...(env.nodeEnv !== "production" ? { devOtp: otp } : {})
      });
    })
  );

  app.post(
    "/auth/verify-otp",
    asyncHandler(async (req, res) => {
      const { email, otp } = verifyOtpSchema.parse(req.body);
      const cachedOtp = await redis.get(`otp:${email}`);
      if (!cachedOtp || cachedOtp !== otp) {
        throw new ApiError(401, "Invalid OTP");
      }

      const patient = await findOrCreatePatientByEmail(pool, email);
      const session = await issuePatientSession({
        env,
        pool,
        producer,
        patient,
        auditEventType: "auth.otp.verified",
        metadata: {
          email,
          provider: "otp"
        }
      });

      await redis.del(`otp:${email}`);
      setSessionCookies(res, env, session.accessToken, session.refreshToken);

      res.status(200).json(session);
    })
  );

  app.post(
    "/auth/staff/login",
    asyncHandler(async (req, res) => {
      const { email, password } = staffLoginSchema.parse(req.body);
      const staffUser = await findStaffUserByEmail(pool, email);

      if (!staffUser || !staffUser.passwordHash) {
        throw new ApiError(401, "Invalid staff credentials");
      }

      if (staffUser.status !== "active") {
        throw new ApiError(403, "Staff account is inactive");
      }

      const matches = await verifyPassword(password, staffUser.passwordHash);
      if (!matches) {
        throw new ApiError(401, "Invalid staff credentials");
      }

      const session = await issueStaffSession({
        env,
        pool,
        producer,
        staffUser,
        auditEventType: "auth.staff.login",
        metadata: {
          email: staffUser.email,
          role: staffUser.role
        }
      });

      setSessionCookies(res, env, session.accessToken, session.refreshToken);
      res.status(200).json(session);
    })
  );

  app.get(
    "/auth/staff/invitations/:inviteToken",
    asyncHandler(async (req, res) => {
      const inviteToken = req.params.inviteToken;
      if (typeof inviteToken !== "string") {
        throw new ApiError(400, "Invalid invite token");
      }

      const invite = await getStaffInviteByToken(pool, inviteToken);
      if (!invite) {
        throw new ApiError(404, "Invite not found");
      }

      res.status(200).json({
        email: invite.email,
        role: invite.role,
        doctorId: invite.doctorId,
        expiresAt: invite.expiresAt.toISOString(),
        acceptedAt: invite.acceptedAt?.toISOString() ?? null,
        status: invite.status
      });
    })
  );

  app.post(
    "/auth/staff/invitations",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const auth = (req as RequestWithAuth).auth;
      if (!auth) {
        throw new ApiError(401, "Unauthorized");
      }

      const payload = staffInviteSchema.parse(req.body);
      let doctorId: string | null = null;
      let doctorDisplayName: string | undefined;

      if (payload.role === "doctor") {
        doctorId = await createDoctorProfile(pool, payload.doctorProfile);
        doctorDisplayName = payload.doctorProfile.fullName;
      }

      const invite = await createStaffInvite(pool, {
        email: payload.email,
        role: payload.role,
        doctorId,
        ttlSeconds: env.staffInviteTtlSeconds
      });

      const setupUrl = buildInviteUrl(env, invite.inviteToken);
      await Promise.all([
        publishEventSafely(producer, KAFKA_TOPICS.NOTIFICATION_REQUESTED, invite.staffUserId, {
          notificationId: uuidv4(),
          channel: "email",
          destination: invite.email,
          template: "staff_invite",
          data: {
            setupUrl,
            role: invite.role,
            doctorName: doctorDisplayName
          },
          requestedAt: new Date().toISOString()
        }),
        publishEventSafely(producer, KAFKA_TOPICS.AUDIT_EVENT_LOGGED, invite.staffUserId, {
          eventType: "auth.staff.invite.created",
          actorType: auth.role,
          actorId: auth.userId,
          metadata: {
            email: invite.email,
            role: invite.role,
            doctorId
          },
          occurredAt: new Date().toISOString()
        })
      ]);

      res.status(201).json({
        email: invite.email,
        role: invite.role,
        doctorId,
        expiresAt: invite.expiresAt.toISOString(),
        setupUrl
      });
    })
  );

  app.post(
    "/auth/staff/invitations/accept",
    asyncHandler(async (req, res) => {
      const { inviteToken, password } = acceptStaffInviteSchema.parse(req.body);
      const staffUser = await acceptStaffInvite(pool, inviteToken, password);
      const session = await issueStaffSession({
        env,
        pool,
        producer,
        staffUser,
        auditEventType: "auth.staff.invite.accepted",
        metadata: {
          email: staffUser.email,
          role: staffUser.role
        }
      });

      setSessionCookies(res, env, session.accessToken, session.refreshToken);
      res.status(200).json(session);
    })
  );

  app.get(
    "/auth/staff/users",
    requireRoles(env.jwtAccessSecret, ["admin"], env.jwtIssuer),
    asyncHandler(async (req, res) => {
      const role = req.query.role === "doctor" || req.query.role === "admin" ? req.query.role : undefined;
      const users = await listStaffUsers(pool, role);
      res.status(200).json({
        users
      });
    })
  );

  app.post(
    "/auth/refresh",
    asyncHandler(async (req, res) => {
      const payload = refreshSchema.parse(req.body ?? {});
      const refreshToken = resolveRefreshToken(req.cookies?.refresh_token, payload.refreshToken);
      if (!refreshToken) {
        throw new ApiError(401, "Refresh token is required");
      }

      const claims = verifyToken(refreshToken, env.jwtRefreshSecret, env.jwtIssuer);
      if (claims.tokenType !== "refresh" || claims.role !== "patient") {
        throw new ApiError(401, "Invalid refresh token");
      }

      const tokenRecord = await getRefreshTokenRecord(pool, refreshToken);
      if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt.getTime() < Date.now()) {
        throw new ApiError(401, "Refresh token is not active");
      }

      const nextAccessToken = signAccessToken(
        {
          subjectId: claims.sub,
          role: "patient",
          email: claims.email,
          patientId: claims.patientId ?? claims.sub
        },
        env.jwtAccessSecret,
        env.jwtIssuer
      );
      const nextRefreshToken = signRefreshToken(
        {
          subjectId: claims.sub,
          role: "patient",
          email: claims.email,
          patientId: claims.patientId ?? claims.sub
        },
        env.jwtRefreshSecret,
        env.jwtIssuer
      );
      const nextRefreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await Promise.all([
        revokeRefreshToken(pool, refreshToken),
        storeRefreshToken(pool, claims.sub, nextRefreshToken, nextRefreshExpiry)
      ]);

      setSessionCookies(res, env, nextAccessToken, nextRefreshToken);

      res.status(200).json({
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        role: "patient",
        patientId: claims.patientId ?? claims.sub,
        staffUserId: null,
        doctorId: null
      });
    })
  );

  app.post(
    "/auth/staff/refresh",
    asyncHandler(async (req, res) => {
      const payload = refreshSchema.parse(req.body ?? {});
      const refreshToken = resolveRefreshToken(req.cookies?.refresh_token, payload.refreshToken);
      if (!refreshToken) {
        throw new ApiError(401, "Refresh token is required");
      }

      const claims = verifyToken(refreshToken, env.jwtRefreshSecret, env.jwtIssuer);
      if (claims.tokenType !== "refresh" || (claims.role !== "doctor" && claims.role !== "admin")) {
        throw new ApiError(401, "Invalid refresh token");
      }

      const tokenRecord = await getStaffRefreshTokenRecord(pool, refreshToken);
      if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt.getTime() < Date.now()) {
        throw new ApiError(401, "Refresh token is not active");
      }

      const nextAccessToken = signAccessToken(
        {
          subjectId: claims.sub,
          role: claims.role,
          email: claims.email,
          staffUserId: claims.staffUserId ?? claims.sub,
          doctorId: claims.doctorId ?? null
        },
        env.jwtAccessSecret,
        env.jwtIssuer
      );
      const nextRefreshToken = signRefreshToken(
        {
          subjectId: claims.sub,
          role: claims.role,
          email: claims.email,
          staffUserId: claims.staffUserId ?? claims.sub,
          doctorId: claims.doctorId ?? null
        },
        env.jwtRefreshSecret,
        env.jwtIssuer
      );
      const nextRefreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await Promise.all([
        revokeStaffRefreshToken(pool, refreshToken),
        storeStaffRefreshToken(pool, claims.sub, nextRefreshToken, nextRefreshExpiry)
      ]);

      setSessionCookies(res, env, nextAccessToken, nextRefreshToken);

      res.status(200).json({
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        role: claims.role,
        patientId: null,
        staffUserId: claims.staffUserId ?? claims.sub,
        doctorId: claims.doctorId ?? null
      });
    })
  );

  app.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      const payload = refreshSchema.parse(req.body ?? {});
      const refreshToken = resolveRefreshToken(req.cookies?.refresh_token, payload.refreshToken);

      if (refreshToken) {
        try {
          const claims = verifyToken(refreshToken, env.jwtRefreshSecret, env.jwtIssuer);
          if (claims.role === "patient") {
            await revokeRefreshToken(pool, refreshToken);
          } else {
            await revokeStaffRefreshToken(pool, refreshToken);
          }
        } catch {
          // Ignore invalid refresh token on logout.
        }
      }

      res.clearCookie("access_token");
      res.clearCookie("refresh_token");

      res.status(200).json({
        message: "Logged out"
      });
    })
  );

  app.post(
    "/auth/staff/logout",
    asyncHandler(async (req, res) => {
      const payload = refreshSchema.parse(req.body ?? {});
      const refreshToken = resolveRefreshToken(req.cookies?.refresh_token, payload.refreshToken);
      if (refreshToken) {
        await revokeStaffRefreshToken(pool, refreshToken);
      }

      res.clearCookie("access_token");
      res.clearCookie("refresh_token");

      res.status(200).json({
        message: "Logged out"
      });
    })
  );

  return app;
};
