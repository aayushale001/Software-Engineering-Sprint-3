import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { apiClient } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const ProfilePage = () => {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.accessToken);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: async () => apiClient.getProfile(token ?? ""),
    enabled: Boolean(token)
  });

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setFullName(String(profileQuery.data.fullName ?? ""));
    setDateOfBirth(String(profileQuery.data.dateOfBirth ?? ""));
    setPhoneNumber(String(profileQuery.data.phoneNumber ?? ""));
  }, [profileQuery.data]);

  const hasMissingData = useMemo(() => !fullName || !dateOfBirth || !phoneNumber, [dateOfBirth, fullName, phoneNumber]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return apiClient.updateProfile(token ?? "", {
        fullName,
        dateOfBirth,
        phoneNumber
      });
    },
    onSuccess: async (result) => {
      setStatus("Profile saved.");
      await profileQuery.refetch();
      if (result.profile.profileComplete) {
        navigate("/", { replace: true });
      }
    },
    onError: (error) => {
      setStatus((error as Error).message);
    }
  });

  return (
    <section className="mx-auto max-w-2xl rounded-2xl bg-white p-5 shadow-glow">
      <h2 className="text-xl font-bold text-accent2">My Profile</h2>
      <p className="text-sm text-slate-600">Keep your contact details current for reminders and care updates.</p>

      {hasMissingData ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Complete all profile fields to finish onboarding.
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          Full Name
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-accent"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Date of Birth
          <input
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-accent"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Phone Number
          <input
            type="text"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-accent"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={updateMutation.isPending || !token}
        onClick={() => updateMutation.mutate()}
        className="mt-4 rounded-xl bg-accent2 px-4 py-2 font-semibold text-white hover:bg-[#0a3760] disabled:opacity-70"
      >
        Save Profile
      </button>

      {status ? <p className="mt-3 text-sm text-slate-700">{status}</p> : null}
    </section>
  );
};
