import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/app-shell";
import { PatientOnboardingGate } from "./components/patient-onboarding-gate";
import { ProtectedRoute } from "./components/protected-route";
import { AdminAppointmentsPage } from "./pages/admin-appointments-page";
import { AdminAuditPage } from "./pages/admin-audit-page";
import { AdminDoctorsPage } from "./pages/admin-doctors-page";
import { AdminPatientsPage } from "./pages/admin-patients-page";
import { AdminStaffPage } from "./pages/admin-staff-page";
import { BookAppointmentPage } from "./pages/book-appointment-page";
import { DashboardPage } from "./pages/dashboard-page";
import { DoctorAppointmentsPage } from "./pages/doctor-appointments-page";
import { DoctorProfilePage } from "./pages/doctor-profile-page";
import { DoctorSchedulePage } from "./pages/doctor-schedule-page";
import { ForgotPasswordPage } from "./pages/forgot-password-page";
import { LoginPage } from "./pages/login-page";
import { MyAppointmentsPage } from "./pages/my-appointments-page";
import { MyRecordsPage } from "./pages/my-records-page";
import { ProfilePage } from "./pages/profile-page";
import { RegisterPage } from "./pages/register-page";
import { ResetPasswordPage } from "./pages/reset-password-page";
import { StaffInvitePage } from "./pages/staff-invite-page";
import { StaffLoginPage } from "./pages/staff-login-page";

const queryClient = new QueryClient();

export const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/staff/login" element={<StaffLoginPage />} />
          <Route path="/staff/invite" element={<StaffInvitePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <PatientOnboardingGate>
                  <AppShell />
                </PatientOnboardingGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route
              path="book"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <BookAppointmentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="appointments"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <MyAppointmentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="records"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <MyRecordsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="profile"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="doctor/appointments"
              element={
                <ProtectedRoute roles={["doctor"]}>
                  <DoctorAppointmentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="doctor/schedule"
              element={
                <ProtectedRoute roles={["doctor"]}>
                  <DoctorSchedulePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="doctor/profile"
              element={
                <ProtectedRoute roles={["doctor"]}>
                  <DoctorProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/doctors"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminDoctorsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/staff"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminStaffPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/patients"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminPatientsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/appointments"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminAppointmentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/audit"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminAuditPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};
