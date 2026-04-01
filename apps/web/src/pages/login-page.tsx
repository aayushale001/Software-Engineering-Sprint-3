import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthLayout,
  authInputWithIconClassName,
  authPanelClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
  authStatusClassName,
  authTertiaryButtonClassName
} from "../components/auth-layout";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  FileTextIcon,
  GoogleIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  ShieldIcon
} from "../components/icons";
import { apiClient } from "../lib/api";
import { finishAuthNavigation } from "../lib/complete-patient-auth";
import { useAuthStore } from "../store/auth-store";

const patientHighlights = [
  {
    icon: ShieldIcon,
    title: "Protected access",
    description: "Use your password, Google sign-in, or OTP fallback without changing your patient flow."
  },
  {
    icon: CalendarIcon,
    title: "Appointments",
    description: "Get back to upcoming visits, booking, and schedule updates in one place."
  },
  {
    icon: FileTextIcon,
    title: "Records",
    description: "Keep medical history and profile details within the same secure portal."
  }
] as const;

export const LoginPage = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [showOtpFallback, setShowOtpFallback] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hasHandledGoogleCallback = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state || hasHandledGoogleCallback.current) {
      return;
    }
    hasHandledGoogleCallback.current = true;

    const exchangeGoogleCode = async () => {
      setLoading(true);
      setStatus("Signing in with Google...");

      try {
        const response = await apiClient.exchangeGoogleCode(code, state);
        await finishAuthNavigation(response, navigate, setAuth);
      } catch (error) {
        setStatus((error as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void exchangeGoogleCode();
  }, [navigate, setAuth]);

  const signInWithPassword = async () => {
    setLoading(true);
    setStatus(null);

    try {
      const response = await apiClient.patientLogin(email, password);
      await finishAuthNavigation(response, navigate, setAuth);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const response = await apiClient.requestOtp(email);
      setDevOtp(response.devOtp ?? null);
      setStatus(`OTP requested. Expires in ${response.expiresInSeconds} seconds.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const response = await apiClient.verifyOtp(email, otp);
      await finishAuthNavigation(response, navigate, setAuth);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const startGoogleSignIn = async () => {
    setLoading(true);
    setStatus(null);

    try {
      const response = await apiClient.getGoogleAuthorizationUrl();
      window.location.assign(response.authorizationUrl);
    } catch (error) {
      setStatus((error as Error).message);
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Patient Access"
      title="Patient Sign In"
      description="Use your email and password to access appointments, records, and profile setup."
      panelTitle="Calmer, clearer access to your care journey."
      panelDescription="Sign in to manage visits, review records, and keep your patient profile up to date with the same secure flows already in place."
      highlights={patientHighlights}
      footer={
        <p>
          Staff member?{" "}
          <Link to="/staff/login" className="font-semibold text-accent2 underline decoration-accent/40 underline-offset-4">
            Use staff login
          </Link>
        </p>
      }
    >
      <div className="space-y-5">
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <MailIcon className="h-4 w-4 text-accent2" />
            Email
          </span>
          <div className="relative">
            <MailIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              className={authInputWithIconClassName}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <LockIcon className="h-4 w-4 text-accent2" />
            Password
          </span>
          <div className="relative">
            <LockIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              className={authInputWithIconClassName}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </label>

        <button
          type="button"
          onClick={signInWithPassword}
          disabled={loading || !email || password.length < 12}
          className={authPrimaryButtonClassName}
        >
          <ShieldIcon className="h-4 w-4" />
          Sign In With Password
          <ArrowRightIcon className="h-4 w-4" />
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link to="/forgot-password" className="font-semibold text-accent2 underline decoration-accent/40 underline-offset-4">
            Forgot password?
          </Link>
          <Link to="/register" className="font-semibold text-accent2 underline decoration-accent/40 underline-offset-4">
            Create account
          </Link>
        </div>

        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span>or continue with Google</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={startGoogleSignIn}
          disabled={loading}
          className={authSecondaryButtonClassName}
        >
          <GoogleIcon className="h-5 w-5" />
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => setShowOtpFallback((current) => !current)}
          className={authTertiaryButtonClassName}
        >
          <KeyIcon className="h-4 w-4" />
          {showOtpFallback ? "Hide OTP Fallback" : "Use OTP Fallback"}
        </button>

        {showOtpFallback ? (
          <div className={authPanelClassName}>
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0b7a75]/10 text-accent">
                <KeyIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-accent2">OTP fallback</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  OTP is still available as a backup if password sign-in is unavailable.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={requestOtp}
              disabled={loading || !email}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 font-semibold text-white shadow-[0_18px_30px_-22px_rgba(11,122,117,0.9)] hover:bg-accent2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Request OTP
            </button>

            <label className="mt-5 block">
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <KeyIcon className="h-4 w-4 text-accent2" />
                OTP
              </span>
              <div className="relative">
                <KeyIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  maxLength={6}
                  className={authInputWithIconClassName}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                />
              </div>
            </label>

            <button
              type="button"
              onClick={verifyOtp}
              disabled={loading || otp.length !== 6}
              className={`${authPrimaryButtonClassName} mt-5`}
            >
              <CheckCircleIcon className="h-4 w-4" />
              Verify OTP
            </button>
          </div>
        ) : null}
      </div>

      {status ? (
        <div className={`${authStatusClassName} mt-6 flex items-start gap-3`}>
          <AlertCircleIcon className="mt-0.5 h-5 w-5 flex-none text-accent2" />
          <p>{status}</p>
        </div>
      ) : null}
    </AuthLayout>
  );
};
