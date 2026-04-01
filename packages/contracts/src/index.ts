import { z } from "zod";

export const KAFKA_TOPICS = {
  APPOINTMENT_HOLD_CREATED: "appointment.hold.created",
  APPOINTMENT_CONFIRMED: "appointment.confirmed",
  APPOINTMENT_CANCELLED: "appointment.cancelled",
  DOCTOR_AVAILABILITY_UPDATED: "doctor.availability.updated",
  MEDICAL_RECORD_CREATED: "medical_record.created",
  NOTIFICATION_REQUESTED: "notification.requested",
  AUDIT_EVENT_LOGGED: "audit.event.logged"
} as const;

export const WS_EVENTS = {
  SLOT_OPENED: "slot_opened",
  SLOT_HELD: "slot_held",
  SLOT_BOOKED: "slot_booked",
  SLOT_RELEASED: "slot_released"
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

const datetimeString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected an ISO datetime string"
});

const uuidLikeString = z.string().min(1);

export const EVENT_SCHEMA_REGISTRY = {
  [KAFKA_TOPICS.APPOINTMENT_HOLD_CREATED]: z.object({
    holdId: uuidLikeString,
    doctorId: uuidLikeString,
    patientId: uuidLikeString,
    slotStart: datetimeString,
    expiresAt: datetimeString
  }),
  [KAFKA_TOPICS.APPOINTMENT_CONFIRMED]: z.object({
    appointmentId: uuidLikeString,
    doctorId: uuidLikeString,
    patientId: uuidLikeString,
    slotStart: datetimeString,
    slotEnd: datetimeString,
    status: z.string().min(1)
  }),
  [KAFKA_TOPICS.APPOINTMENT_CANCELLED]: z.object({
    appointmentId: uuidLikeString,
    patientId: uuidLikeString,
    doctorId: uuidLikeString,
    slotStart: datetimeString,
    cancelledByRole: z.enum(["patient", "doctor", "admin"]).optional(),
    cancelledById: z.string().min(1).optional(),
    reason: z.string().nullable().optional()
  }),
  [KAFKA_TOPICS.DOCTOR_AVAILABILITY_UPDATED]: z.object({
    doctorId: uuidLikeString,
    slotStart: datetimeString,
    status: z.enum(["available", "held", "booked"]),
    patientId: z.string().nullable().optional(),
    eventType: z.string().optional()
  }),
  [KAFKA_TOPICS.MEDICAL_RECORD_CREATED]: z.object({
    recordId: uuidLikeString,
    patientId: uuidLikeString,
    recordType: z.string().min(1),
    recordDate: z.string().min(1),
    createdAt: datetimeString
  }),
  [KAFKA_TOPICS.NOTIFICATION_REQUESTED]: z.object({
    notificationId: uuidLikeString,
    channel: z.enum(["email", "sms"]),
    destination: z.string().min(1),
    template: z.string().min(1),
    data: z.record(z.unknown()).optional(),
    requestedAt: datetimeString
  }),
  [KAFKA_TOPICS.AUDIT_EVENT_LOGGED]: z.object({
    eventType: z.string().min(1),
    actorType: z.string().min(1),
    actorId: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
    occurredAt: datetimeString
  })
} as const;

export type RegisteredEventSchemaMap = typeof EVENT_SCHEMA_REGISTRY;
export type RegisteredKafkaTopic = keyof RegisteredEventSchemaMap;

export const getEventSchema = (topic: string) => {
  return EVENT_SCHEMA_REGISTRY[topic as RegisteredKafkaTopic];
};

export const validateEventPayload = <T extends KafkaTopic>(topic: T, payload: unknown) => {
  const schema = getEventSchema(topic);
  return schema ? schema.parse(payload) : payload;
};
