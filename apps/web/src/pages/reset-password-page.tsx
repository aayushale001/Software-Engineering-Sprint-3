import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  AuthLayout,
  authInputWithIconClassName,
  authPrimaryButtonClassName,
  authStatusClassName
} from "../components/auth-layout";
import { AlertCircleIcon, ArrowRightIcon, CheckCircleIcon, KeyIcon, LockIcon, ShieldIcon } from "../components/icons";
import { apiClient } from "../lib/api";
import { finishAuthNavigation } from "../lib/complete-patient-auth";
import { useAuthStore } from "../store/auth-store";

const resetPasswordHighlights = [
  {
    icon: KeyIcon,
    title: "One-time reset",
    description: "A valid token still controls access to the same password update workflow."
  },
  {
    icon: ShieldIcon,
    title: "Account security",
    description: "Choose a new password without changing any backend behavior or validation."
  },
  {
    icon: CheckCircleIcon,
    title: "Fast return",
    description: "Once complete, you move back into the existing sign-in and session flow."
  }
] as const;

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);

  const token = searchParams.get("token") ?? "";
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [validating, setValidating] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("Reset link is missing.");
      setValidating(false);
      return;
    }

    const validateToken = async () => {
      setValidating(true);
      setStatus(null);

      try {
        const response = await apiClient.getPatientResetToken(token);
        setEmail(response.email);
      } catch (error) {
        setStatus((error as Error).message);
      } finally {
        setValidating(false);
      }
    };

    void validateToken();
  }, [token]);

  const submit = async () => {
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const session = await apiClient.resetPatientPassword(token, password);
      await finishAuthNavigation(session, navigate, setAuth);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Password Reset"
      title="Reset Password"
      description="Choose a new password for your patient account."
      panelTitle="A cleaner final step back into your account."
      panelDescription="The reset link, validation, and sign-in behavior stay the same. This update only makes the experience easier to read and use."
      highlights={resetPasswordHighlights}
      footer={
        <p>
          Need another link?{" "}
          <Link to="/forgot-password" className="font-semibold text-accent2 underline decoration-accent/40 underline-offset-4">
            Request a new reset email
          </Link>
        </p>
      }
    >
      {validating ? (
        <div className={`${authStatusClassName} flex items-start gap-3`}>
          <AlertCircleIcon className="mt-0.5 h-5 w-5 flex-none text-accent2" />
          <p>Validating reset link...</p>
        </div>
      ) : null}

      {!validating && email ? (
        <div className="space-y-5">
          <div className="rounded-[28px] border border-slate-200/80 bg-mist/60 px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-accent2 shadow-[0_16px_26px_-22px_rgba(15,76,129,0.85)]">
                <CheckCircleIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-accent2">Resetting password for {email}</p>
                <p className="text-sm leading-6 text-slate-600">Enter your new password below to continue with the existing secure reset flow.</p>
              </div>
            </div>
          </div>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <LockIcon className="h-4 w-4 text-accent2" />
              New Password
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

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <ShieldIcon className="h-4 w-4 text-accent2" />
              Confirm Password
            </span>
            <div className="relative">
              <ShieldIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                className={authInputWithIconClassName}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
          </label>

          <button
            type="button"
            onClick={submit}
            disabled={loading || password.length < 12 || confirmPassword.length < 12}
            className={authPrimaryButtonClassName}
          >
            <KeyIcon className="h-4 w-4" />
            Save New Password
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {status ? (
        <div className={`${authStatusClassName} mt-6 flex items-start gap-3`}>
          <AlertCircleIcon className="mt-0.5 h-5 w-5 flex-none text-accent2" />
          <p>{status}</p>
        </div>
      ) : null}
    </AuthLayout>
  );
};
