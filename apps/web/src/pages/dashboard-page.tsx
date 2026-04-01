import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";

import { ArrowRightIcon, CalendarIcon, CalendarPlusIcon, FileTextIcon, UserCircleIcon } from "../components/icons";
import { apiClient } from "../lib/api";
import { getHomePathForRole } from "../lib/session";
import { useAuthStore } from "../store/auth-store";

export const DashboardPage = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.role);

  if (role && role !== "patient") {
    return <Navigate to={getHomePathForRole(role)} replace />;
  }

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: async () => apiClient.getProfile(accessToken ?? ""),
    enabled: Boolean(accessToken)
  });

  const recordsQuery = useQuery({
    queryKey: ["records-overview"],
    queryFn: async () => apiClient.listRecords(accessToken ?? ""),
    enabled: Boolean(accessToken)
  });

  const appointmentsQuery = useQuery({
    queryKey: ["appointments-overview"],
    queryFn: async () => apiClient.listAppointments(accessToken ?? ""),
    enabled: Boolean(accessToken)
  });

  const patientName = profileQuery.data?.fullName ?? "Patient";
  const quickActions = [
    { to: "/book", label: "Book appointment", icon: CalendarPlusIcon },
    { to: "/appointments", label: "View appointments", icon: CalendarIcon },
    { to: "/records", label: "Open records", icon: FileTextIcon }
  ] as const;

  const overviewCards = [
    {
      label: "Patient",
      value: patientName,
      description: profileQuery.data?.email ?? "-",
      icon: UserCircleIcon
    },
    {
      label: "Appointments",
      value: String(appointmentsQuery.data?.appointments?.length ?? 0),
      description: "Confirmed and historical visits",
      icon: CalendarIcon
    },
    {
      label: "Medical Records",
      value: String(recordsQuery.data?.records?.length ?? 0),
      description: "Securely available in your portal",
      icon: FileTextIcon
    }
  ] as const;

  return (
    <section className="space-y-6">
      <article className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/75 p-6 shadow-glow backdrop-blur-xl md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(92,184,224,0.12),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(11,122,117,0.1),_transparent_24%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-accent">Patient Overview</p>
            <h2 className="mt-3 font-display text-4xl leading-tight text-accent2 md:text-5xl">Welcome back, {patientName}.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600 md:text-base">
              Everything important for your care journey is organized here so you can move from appointments to records without losing context.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {quickActions.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="inline-flex items-center gap-2 rounded-full bg-accent2 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_32px_-24px_rgba(15,76,129,0.95)] hover:bg-[#0b426f]"
              >
                <Icon className="h-4 w-4" />
                {label}
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-3">
        {overviewCards.map(({ label, value, description, icon: Icon }) => (
          <article key={label} className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-glow backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">{label}</p>
                <h3 className="mt-3 font-display text-3xl leading-tight text-accent2">{value}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mist text-accent2 shadow-[0_18px_30px_-24px_rgba(15,76,129,0.9)]">
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
