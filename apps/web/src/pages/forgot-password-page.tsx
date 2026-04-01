import { useState } from "react";
import { Link } from "react-router-dom";

import {
  AuthLayout,
  authInputWithIconClassName,
  authPrimaryButtonClassName,
  authStatusClassName
} from "../components/auth-layout";
import { AlertCircleIcon, ArrowRightIcon, KeyIcon, LockIcon, MailIcon, ShieldIcon } from "../components/icons";
import { apiClient } from "../lib/api";

const forgotPasswordHighlights = [
  {
    icon: MailIcon,
    title: "Email recovery",
    description: "Request the same reset flow already connected to your patient account."
  },
  {
    icon: KeyIcon,
    title: "Secure reset",
    description: "Only a valid reset link unlocks the next step, just like before."
  },
  {
    icon: ShieldIcon,
    title: "Private by default",
    description: "The experience stays calm and discreet whether an account exists or not."
  }
] as const;

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setStatus(null);

    try {
      const response = await apiClient.patientForgotPassword(email);
      setStatus(response.message);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Password Recovery"
      title="Forgot Password"
      description="Enter your patient email and we will send a reset link if an account exists."
      panelTitle="A smoother reset experience, without changing the flow."
      panelDescription="Recover access through the existing password reset process while the interface keeps things simple, readable, and reassuring."
      highlights={forgotPasswordHighlights}
      footer={
        <p>
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-accent2 underline decoration-accent/40 underline-offset-4">
            Back to login
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

        <div className="rounded-[28px] border border-slate-200/80 bg-mist/60 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-accent2 shadow-[0_16px_26px_-22px_rgba(15,76,129,0.85)]">
              <LockIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-accent2">Secure reset link</p>
              <p className="text-sm leading-6 text-slate-600">We keep the same existing recovery behavior, just with a clearer presentation.</p>
            </div>
          </div>
        </div>

        <button type="button" onClick={submit} disabled={loading || !email} className={authPrimaryButtonClassName}>
          <KeyIcon className="h-4 w-4" />
          Send Reset Link
          <ArrowRightIcon className="h-4 w-4" />
        </button>
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
