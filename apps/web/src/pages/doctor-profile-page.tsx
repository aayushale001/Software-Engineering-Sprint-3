import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const DoctorProfilePage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [status, setStatus] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [bio, setBio] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const profileQuery = useQuery({
    queryKey: ["doctor-profile"],
    queryFn: async () => apiClient.getDoctorProfile(token ?? ""),
    enabled: Boolean(token)
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setFullName(profileQuery.data.fullName);
    setSpecialty(profileQuery.data.specialty);
    setTimezone(profileQuery.data.timezone);
    setBio(profileQuery.data.bio ?? "");
    setPhoneNumber(profileQuery.data.phoneNumber ?? "");
  }, [profileQuery.data]);

  const mutation = useMutation({
    mutationFn: async () =>
      apiClient.updateDoctorProfile(token ?? "", {
        fullName,
        specialty,
        timezone,
        bio,
        phoneNumber
      }),
    onSuccess: async () => {
      setStatus("Profile saved.");
      await profileQuery.refetch();
    },
    onError: (error) => {
      setStatus((error as Error).message);
    }
  });

  return (
    <section className="mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-glow">
      <h2 className="text-xl font-bold text-accent2">Doctor Profile</h2>
      <p className="text-sm text-slate-600">Keep your profile accurate for patient-facing discovery and admin reviews.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          Full Name
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Specialty
          <input value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Timezone
          <input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Phone Number
          <input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>

        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          Bio
          <textarea value={bio} onChange={(event) => setBio(event.target.value)} className="mt-1 min-h-32 w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
      </div>

      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !token}
        className="mt-4 rounded-xl bg-accent2 px-4 py-2 font-semibold text-white hover:bg-[#0a3760] disabled:opacity-70"
      >
        Save Profile
      </button>

      {status ? <p className="mt-3 text-sm text-slate-700">{status}</p> : null}
    </section>
  );
};
