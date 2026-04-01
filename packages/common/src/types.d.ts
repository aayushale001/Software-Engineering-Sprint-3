import "express";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: "patient" | "doctor" | "admin";
        email: string;
        patientId: string | null;
        staffUserId: string | null;
        doctorId: string | null;
      };
    }
  }
}

export {};
