import nodemailer from "nodemailer";

import { createLogger, type ServiceEnv } from "@hospital/common";

const logger = createLogger("notification-mailer");

export type NotificationEvent = {
  notificationId: string;
  channel: "email" | "sms";
  destination: string;
  template: string;
  data?: Record<string, unknown>;
  requestedAt: string;
};

type NotificationMailer = {
  send: (notification: NotificationEvent) => Promise<void>;
};

export const createNotificationMailer = (env: ServiceEnv): NotificationMailer | null => {
  const sender = env.smtpUser || env.smtpFrom;

  if (!env.smtpEnabled || !env.smtpHost || !sender) {
    logger.warn("SMTP settings are incomplete; email notifications will remain queued");
    return null;
  }

  logger.info(
    {
      smtpHost: env.smtpHost,
      smtpPort: env.smtpPort,
      smtpSecure: env.smtpSecure,
      smtpAuthEnabled: Boolean(env.smtpUser),
      sender
    },
    "SMTP mailer configured"
  );

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: env.smtpUser
      ? {
          user: env.smtpUser,
          pass: env.smtpPass ?? ""
        }
      : undefined
  });

  return {
    send: async (notification) => {
      if (notification.channel !== "email") {
        logger.info(
          {
            notificationId: notification.notificationId,
            channel: notification.channel
          },
          "notification channel is not backed by the SMTP mailer"
        );
        return;
      }

      const content = renderTemplate(notification);
      await transporter.sendMail({
        from: sender,
        to: notification.destination,
        subject: content.subject,
        text: content.text,
        html: content.html
      });
    }
  };
};

const renderTemplate = (notification: NotificationEvent) => {
  switch (notification.template) {
    case "otp_login":
      return renderOtpTemplate(notification);
    case "patient_password_reset":
      return renderPatientPasswordResetTemplate(notification);
    case "staff_invite":
      return renderStaffInviteTemplate(notification);
    case "appointment_confirmed":
      return renderAppointmentTemplate(notification);
    case "appointment_cancelled":
      return renderAppointmentCancelledTemplate(notification);
    default:
      return renderFallbackTemplate(notification);
  }
};

const renderOtpTemplate = (notification: NotificationEvent) => {
  const otp = typeof notification.data?.otp === "string" ? notification.data.otp : "Unavailable";
  const expiresInSeconds =
    typeof notification.data?.expiresInSeconds === "number" ? notification.data.expiresInSeconds : undefined;
  const expiryLine = expiresInSeconds ? `This code expires in ${expiresInSeconds} seconds.` : "This code expires soon.";

  return {
    subject: "Your hospital login code",
    text: `Your one-time login code is ${otp}. ${expiryLine}`,
    html: `<p>Your one-time login code is <strong>${escapeHtml(otp)}</strong>.</p><p>${escapeHtml(expiryLine)}</p>`
  };
};

const renderPatientPasswordResetTemplate = (notification: NotificationEvent) => {
  const resetUrl = typeof notification.data?.resetUrl === "string" ? notification.data.resetUrl : "";
  const expiresInSeconds =
    typeof notification.data?.expiresInSeconds === "number" ? notification.data.expiresInSeconds : undefined;
  const expiryLine = expiresInSeconds ? `This reset link expires in ${expiresInSeconds} seconds.` : "This reset link expires soon.";

  return {
    subject: "Reset your hospital password",
    text: `Use this link to reset your hospital password: ${resetUrl}\n\n${expiryLine}`,
    html: `<p>Use this link to reset your hospital password:</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p><p>${escapeHtml(expiryLine)}</p>`
  };
};

const renderAppointmentTemplate = (notification: NotificationEvent) => {
  const appointmentId =
    typeof notification.data?.appointmentId === "string" ? notification.data.appointmentId : "Unknown";
  const slotStart = typeof notification.data?.slotStart === "string" ? notification.data.slotStart : "Unknown";
  const doctorName = typeof notification.data?.doctorName === "string" ? notification.data.doctorName : "your doctor";

  return {
    subject: "Appointment confirmed",
    text: `Your appointment ${appointmentId} with ${doctorName} is confirmed for ${slotStart}.`,
    html: `<p>Your appointment <strong>${escapeHtml(appointmentId)}</strong> with <strong>${escapeHtml(doctorName)}</strong> is confirmed for <strong>${escapeHtml(slotStart)}</strong>.</p>`
  };
};

const renderAppointmentCancelledTemplate = (notification: NotificationEvent) => {
  const appointmentId =
    typeof notification.data?.appointmentId === "string" ? notification.data.appointmentId : "Unknown";
  const slotStart = typeof notification.data?.slotStart === "string" ? notification.data.slotStart : "Unknown";
  const reason = typeof notification.data?.reason === "string" ? notification.data.reason : "The schedule changed.";
  const doctorName = typeof notification.data?.doctorName === "string" ? notification.data.doctorName : "your doctor";

  return {
    subject: "Appointment cancelled",
    text: `Your appointment ${appointmentId} with ${doctorName} for ${slotStart} was cancelled. Reason: ${reason}`,
    html: `<p>Your appointment <strong>${escapeHtml(appointmentId)}</strong> with <strong>${escapeHtml(doctorName)}</strong> for <strong>${escapeHtml(slotStart)}</strong> was cancelled.</p><p>Reason: ${escapeHtml(reason)}</p>`
  };
};

const renderStaffInviteTemplate = (notification: NotificationEvent) => {
  const setupUrl = typeof notification.data?.setupUrl === "string" ? notification.data.setupUrl : "";
  const role = typeof notification.data?.role === "string" ? notification.data.role : "staff";
  const doctorName = typeof notification.data?.doctorName === "string" ? notification.data.doctorName : null;
  const greeting = doctorName ? `Hello ${doctorName},` : "Hello,";

  return {
    subject: "Set up your hospital staff account",
    text: `${greeting}\n\nYou have been invited as a ${role}. Set your password here: ${setupUrl}`,
    html: `<p>${escapeHtml(greeting)}</p><p>You have been invited as a <strong>${escapeHtml(role)}</strong>.</p><p><a href="${escapeHtml(setupUrl)}">Set your password</a></p>`
  };
};

const renderFallbackTemplate = (notification: NotificationEvent) => {
  return {
    subject: `Hospital notification: ${notification.template}`,
    text: JSON.stringify(notification.data ?? {}, null, 2),
    html: `<pre>${escapeHtml(JSON.stringify(notification.data ?? {}, null, 2))}</pre>`
  };
};

const escapeHtml = (value: string) => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};
