import type { ComponentType } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { IconProps } from "./icons";
import {
  BrandPulseIcon,
  CalendarIcon,
  CalendarPlusIcon,
  ClockIcon,
  FileTextIcon,
  HomeIcon,
  LogoutIcon,
  ShieldIcon,
  StethoscopeIcon,
  UserCircleIcon,
  UsersIcon
} from "./icons";
import { apiClient } from "../lib/api";
import type { AuthRole } from "../lib/session";
import { getHomePathForRole } from "../lib/session";
import { useAuthStore } from "../store/auth-store";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<IconProps>;
};

const navByRole: Record<AuthRole, NavItem[]> = {
  patient: [
    { to: "/", label: "Dashboard", icon: HomeIcon },
    { to: "/book", label: "Book Appointment", icon: CalendarPlusIcon },
    { to: "/appointments", label: "My Appointments", icon: ClockIcon },
    { to: "/records", label: "Medical Records", icon: FileTextIcon },
    { to: "/profile", label: "My Profile", icon: UserCircleIcon }
  ],
  doctor: [
    { to: "/doctor/appointments", label: "Appointments", icon: CalendarIcon },
    { to: "/doctor/schedule", label: "Schedule", icon: ClockIcon },
    { to: "/doctor/profile", label: "Profile", icon: UserCircleIcon }
  ],
  admin: [
    { to: "/admin/doctors", label: "Doctors", icon: StethoscopeIcon },
    { to: "/admin/staff", label: "Staff", icon: UsersIcon },
    { to: "/admin/patients", label: "Patients", icon: UserCircleIcon },
    { to: "/admin/appointments", label: "Appointments", icon: CalendarIcon },
    { to: "/admin/audit", label: "Audit", icon: ShieldIcon }
  ]
};

export const AppShell = () => {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: async () => apiClient.getProfile(accessToken ?? ""),
    enabled: role === "patient" && Boolean(accessToken)
  });

  const onLogout = async () => {
    try {
      await apiClient.logout();
    } catch {
      // Local session should still be cleared even if the backend token is already gone.
    }

    clearAuth();
    navigate(role === "doctor" || role === "admin" ? "/staff/login" : "/login");
  };

  const patientNeedsSetup =
    role === "patient" && (profileQuery.isPending || (profileQuery.data ? !profileQuery.data.profileComplete : false));
  const navItems =
    role === "patient" && patientNeedsSetup
      ? [{ to: "/profile", label: "My Profile", icon: UserCircleIcon }]
      : role
        ? navByRole[role]
        : [];
  const shellCopy = {
    admin: {
      title: "Hospital Admin Console",
      subtitle: "Keep doctors, staff, patients, appointments, and audit visibility aligned in one place.",
      badge: "Admin Workspace"
    },
    doctor: {
      title: "Doctor Operations Hub",
      subtitle: "Stay on top of appointments, schedule availability, and profile details without losing focus.",
      badge: "Doctor Workspace"
    },
    patient: {
      title: "Patient Care Hub",
      subtitle: "Track appointments, records, and personal details in a calmer portal designed to feel more approachable.",
      badge: "Patient Workspace"
    }
  };

  const shellContent = role ? shellCopy[role] : shellCopy.patient;
  const userLabel =
    role === "patient"
      ? profileQuery.data?.fullName || profileQuery.data?.email || "Patient account"
      : role === "doctor"
        ? "Doctor account"
        : role === "admin"
          ? "Administrator account"
          : "Hospital account";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 md:px-8">
      <header className="relative mb-6 overflow-hidden rounded-[32px] border border-white/70 bg-white/75 p-5 shadow-glow backdrop-blur-xl md:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(92,184,224,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(11,122,117,0.1),_transparent_26%)]" />
        <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-cyan-200/20 blur-3xl" />

        <div className="relative flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-sm font-semibold text-accent2">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent2 text-white shadow-[0_18px_32px_-24px_rgba(15,76,129,0.95)]">
                  <BrandPulseIcon className="h-5 w-5" />
                </span>
                Hospital Management
              </div>

              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.32em] text-accent">{shellContent.badge}</p>
              <h1 className="mt-3 font-display text-3xl leading-tight text-accent2 md:text-4xl">{shellContent.title}</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 md:text-base">{shellContent.subtitle}</p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <div className="rounded-[24px] border border-white/80 bg-white/80 px-4 py-3 shadow-[0_20px_32px_-28px_rgba(15,76,129,0.9)]">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{shellContent.badge}</p>
                <p className="mt-1 font-semibold text-accent2">{userLabel}</p>
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[0_20px_32px_-24px_rgba(11,122,117,0.9)] hover:bg-accent2"
                onClick={onLogout}
              >
                <LogoutIcon className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-full px-4 py-2 ${
                      isActive
                        ? "bg-accent2 text-white shadow-[0_18px_30px_-24px_rgba(15,76,129,0.95)]"
                        : "bg-white/70 text-slate-700 hover:bg-white"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
            {role && !patientNeedsSetup ? (
              <Link
                to={getHomePathForRole(role)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/60 px-4 py-2 text-slate-700 hover:bg-white"
              >
                <HomeIcon className="h-4 w-4" />
                Home
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};
