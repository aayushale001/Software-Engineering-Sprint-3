import { useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api";
import { getHomePathForRole } from "../lib/session";
import { useAuthStore } from "../store/auth-store";

export const StaffInvitePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const inviteToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const inviteQuery = useQuery({
    queryKey: ["staff-invite", inviteToken],
    queryFn: async () => apiClient.getStaffInvite(inviteToken),
    enabled: Boolean(inviteToken)
  });

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const session = await apiClient.acceptStaffInvite(inviteToken, password);
      setAuth(session);
      navigate(getHomePathForRole(session.role), { replace: true });
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-12 w-full max-w-lg rounded-3xl bg-white/80 p-8 shadow-glow backdrop-blur">
      <h2 className="text-2xl font-bold text-accent2">Set Up Staff Account</h2>
      <p className="mt-2 text-sm text-slate-600">Use the invite sent to your email to create your password.</p>

      {inviteToken ? null : <p className="mt-4 text-sm text-red-700">Invite token is missing.</p>}

      {inviteQuery.data ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>Email: {inviteQuery.data.email}</p>
          <p>Role: {inviteQuery.data.role}</p>
          <p>Invite status: {inviteQuery.data.status}</p>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-accent"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Confirm Password
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-accent"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={loading || !inviteToken || password.length < 12 || confirmPassword.length < 12}
          className="w-full rounded-xl bg-accent2 px-4 py-2 font-semibold text-white hover:bg-[#0a3760] disabled:opacity-70"
        >
          Activate Account
        </button>
      </div>

      {status ? <p className="mt-4 text-sm text-slate-700">{status}</p> : null}
      <p className="mt-4 text-sm text-slate-700">
        Already activated?{" "}
        <Link to="/staff/login" className="font-semibold text-accent2 underline">
          Go to staff login
        </Link>
      </p>
    </div>
  );
};
