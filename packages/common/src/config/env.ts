import { z } from "zod";

const booleanString = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return value;
}, z.boolean());

const sharedSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  KAFKA_BROKERS: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16).default("development-access-secret"),
  JWT_REFRESH_SECRET: z.string().min(16).default("development-refresh-secret"),
  JWT_ISSUER: z.string().min(1).default("patient-auth"),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: booleanString.default(false),
  STAFF_INVITE_TTL_SECONDS: z.coerce.number().int().positive().default(172800),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional()
});

export type ServiceEnv = {
  appPort: number;
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  redisUrl: string;
  kafkaBrokers: string[];
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtIssuer: string;
  otpTtlSeconds: number;
  frontendOrigin: string;
  googleOAuthClientId?: string;
  googleOAuthClientSecret?: string;
  googleOAuthRedirectUri?: string;
  googleOAuthStateTtlSeconds: number;
  googleOAuthEnabled: boolean;
  smtpHost?: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  smtpSecure: boolean;
  smtpEnabled: boolean;
  staffInviteTtlSeconds: number;
  adminBootstrapEmail?: string;
  adminBootstrapPassword?: string;
};

type LoadServiceEnvOptions = {
  serviceName?: string;
};

const resolveServiceDatabaseUrl = (
  source: Record<string, unknown>,
  serviceName?: string
): string | undefined => {
  if (!serviceName) {
    return typeof source.DATABASE_URL === "string" ? source.DATABASE_URL : undefined;
  }

  const specificKey = `${serviceName.toUpperCase().replace(/-/g, "_")}_DATABASE_URL`;
  const specificValue = source[specificKey];
  if (typeof specificValue === "string" && specificValue.length > 0) {
    return specificValue;
  }

  return typeof source.DATABASE_URL === "string" ? source.DATABASE_URL : undefined;
};

export const loadServiceEnv = (
  overrides: Partial<Record<keyof z.infer<typeof sharedSchema>, unknown>> = {},
  options: LoadServiceEnvOptions = {}
): ServiceEnv => {
  const source = {
    ...process.env,
    ...overrides
  } as Record<string, unknown>;

  const parsed = sharedSchema.parse({
    ...source,
    DATABASE_URL: resolveServiceDatabaseUrl(source, options.serviceName)
  });

  const googleOAuthEnabled = Boolean(
    parsed.GOOGLE_OAUTH_CLIENT_ID && parsed.GOOGLE_OAUTH_CLIENT_SECRET && parsed.GOOGLE_OAUTH_REDIRECT_URI
  );
  const smtpEnabled = Boolean(parsed.SMTP_HOST && (parsed.SMTP_FROM || parsed.SMTP_USER));

  return {
    appPort: parsed.APP_PORT,
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    kafkaBrokers: parsed.KAFKA_BROKERS.split(",").map((broker) => broker.trim()),
    jwtAccessSecret: parsed.JWT_ACCESS_SECRET,
    jwtRefreshSecret: parsed.JWT_REFRESH_SECRET,
    jwtIssuer: parsed.JWT_ISSUER,
    otpTtlSeconds: parsed.OTP_TTL_SECONDS,
    frontendOrigin: parsed.FRONTEND_ORIGIN,
    googleOAuthClientId: parsed.GOOGLE_OAUTH_CLIENT_ID,
    googleOAuthClientSecret: parsed.GOOGLE_OAUTH_CLIENT_SECRET,
    googleOAuthRedirectUri: parsed.GOOGLE_OAUTH_REDIRECT_URI,
    googleOAuthStateTtlSeconds: parsed.GOOGLE_OAUTH_STATE_TTL_SECONDS,
    googleOAuthEnabled,
    smtpHost: parsed.SMTP_HOST,
    smtpPort: parsed.SMTP_PORT,
    smtpUser: parsed.SMTP_USER,
    smtpPass: parsed.SMTP_PASS,
    smtpFrom: parsed.SMTP_FROM,
    smtpSecure: parsed.SMTP_SECURE,
    smtpEnabled,
    staffInviteTtlSeconds: parsed.STAFF_INVITE_TTL_SECONDS,
    adminBootstrapEmail: parsed.ADMIN_BOOTSTRAP_EMAIL,
    adminBootstrapPassword: parsed.ADMIN_BOOTSTRAP_PASSWORD
  };
};
