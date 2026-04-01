import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthLayout,
  authInputWithIconClassName,
  authPrimaryButtonClassName,
  authStatusClassName
} from "../components/auth-layout";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CalendarIcon,
  LockIcon,
  MailIcon,
  ShieldIcon,
  StethoscopeIcon,
  UsersIcon
} from "../components/icons";
import { apiClient } from "../lib/api";
import { getHomePathForRole } from "../lib/session";
import { useAuthStore } from "../store/auth-store";

const staffHighlights = [
  {
    icon: StethoscopeIcon,
    title: "Clinical workflows",
    description: "Doctors can jump straight into appointments, schedules, and profile management."
  },
  {
    icon: UsersIcon,
    title: "Admin oversight",
    description: "Admins keep staff, patient, and operations views organized in one workspace."
  },
  {
    icon: ShieldIcon,
    title: "Role-aware access",
    description: "Existing invited-account authentication stays exactly the same."
  }
] as const;

export const StaffLoginPage = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setStatus(null);

    try {
      const session = await apiClient.staffLogin(email, password);
      setAuth(session);
      navigate(getHomePathForRole(session.role), { replace: true });
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Staff Access"
      title="Staff Login"
      description="Doctors and admins sign in here with their invited account."
      panelTitle="Focused access for care teams and operations."
      panelDescription="Keep clinical work and hospital administration moving with the same secure invited-account flow, wrapped in a clearer interface."
      highlights={staffHighlights}
      footer={
        <p>
          Patient portal?{" "}
          <Link to="/login" className="font-semibold text-accent2 underline decoration-accent/40 underline-offset-4">
            Go to patient login
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
          onClick={submit}
          disabled={loading || !email || password.length < 8}
          className={authPrimaryButtonClassName}
        >
          <ShieldIcon className="h-4 w-4" />
          Sign In
          <ArrowRightIcon className="h-4 w-4" />
        </button>

        <div className="rounded-[28px] border border-slate-200/80 bg-mist/60 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-accent2 shadow-[0_16px_26px_-22px_rgba(15,76,129,0.85)]">
              <CalendarIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-accent2">Invited account access</p>
              <p className="text-sm leading-6 text-slate-600">Use the same credentials already assigned to your staff account.</p>
            </div>
          </div>
        </div>
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
