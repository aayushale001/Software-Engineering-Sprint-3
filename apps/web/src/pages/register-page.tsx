import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthLayout,
  authInputWithIconClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
  authStatusClassName
} from "../components/auth-layout";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CalendarIcon,
  FileTextIcon,
  GoogleIcon,
  LockIcon,
  MailIcon,
  ShieldIcon,
  UserPlusIcon
} from "../components/icons";
import { apiClient } from "../lib/api";
import { finishAuthNavigation } from "../lib/complete-patient-auth";
import { useAuthStore } from "../store/auth-store";

const registerHighlights = [
  {
    icon: UserPlusIcon,
    title: "Fast setup",
    description: "Start with the same email and password registration flow already wired into the app."
  },
  {
    icon: CalendarIcon,
    title: "Visit ready",
    description: "Move from sign-up into booking, appointments, and profile completion without friction."
  },
  {
    icon: FileTextIcon,
    title: "Secure records",
    description: "Your patient workspace stays connected to profile and record access after sign-in."
  }
] as const;

export const RegisterPage = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getValidationError = (): string | null => {
    if (!email.trim()) {
      return "Email is required.";
    }

    if (password.length < 12) {
      return "Password must be at least 12 characters.";
    }

    if (confirmPassword.length < 12) {
      return "Confirm password must be at least 12 characters.";
    }

    if (password !== confirmPassword) {
      return "Passwords do not match.";
    }

    return null;
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

  const completeRegistration = async () => {
    const validationError = getValidationError();
    if (validationError) {
      setStatus(validationError);
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const auth = await apiClient.patientSignup(email.trim(), password);
      await finishAuthNavigation(auth, navigate, setAuth);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Patient Registration"
      title="Create Patient Account"
      description="Sign up with email and password, then finish your patient profile after you log in."
      panelTitle="A more welcoming start to the patient experience."
      panelDescription="Create your account with the same secure registration flow, then continue into appointments, records, and profile setup."
      highlights={registerHighlights}
      footer={
        <div className="space-y-2">
          <p>
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-accent2 underline decoration-accent/40 underline-offset-4">
              Back to login
            </Link>
          </p>
          <p>
            Staff member?{" "}
            <Link to="/staff/login" className="font-semibold text-accent2 underline decoration-accent/40 underline-offset-4">
              Use staff login
            </Link>
          </p>
        </div>
      }
    >
      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void completeRegistration();
        }}
      >
        <label className="block md:col-span-2">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <MailIcon className="h-4 w-4 text-accent2" />
            Email
          </span>
          <div className="relative">
            <MailIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className={authInputWithIconClassName}
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className={authInputWithIconClassName}
            />
          </div>
          <span className="mt-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Use at least 12 characters.</span>
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
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className={authInputWithIconClassName}
            />
          </div>
        </label>

        <button type="submit" disabled={loading} className={`${authPrimaryButtonClassName} md:col-span-2`}>
          <UserPlusIcon className="h-4 w-4" />
          Create Account
          <ArrowRightIcon className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 md:col-span-2">
          <span className="h-px flex-1 bg-slate-200" />
          <span>or use Google</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={startGoogleSignIn}
          className={`${authSecondaryButtonClassName} md:col-span-2`}
        >
          <GoogleIcon className="h-5 w-5" />
          Continue with Google
        </button>
      </form>

      {status ? (
        <div className={`${authStatusClassName} mt-6 flex items-start gap-3`}>
          <AlertCircleIcon className="mt-0.5 h-5 w-5 flex-none text-accent2" />
          <p>{status}</p>
        </div>
      ) : null}
    </AuthLayout>
  );
};
