import type { IncomingMessage } from "node:http";
import { URL } from "node:url";

import { WebSocketServer, type WebSocket } from "ws";

import { verifyToken, type ServiceEnv } from "@hospital/common";

type ClientContext = {
  ws: WebSocket;
  patientId: string;
  doctorSubscriptions: Set<string>;
};

type AvailabilityEventPayload = {
  doctorId: string;
  patientId?: string | null;
  slotStart: string;
  status: string;
  eventType?: string;
};

export class WebsocketHub {
  private readonly clients = new Set<ClientContext>();

  constructor(
    private readonly wss: WebSocketServer,
    private readonly env: ServiceEnv
  ) {}

  public start(): void {
    this.wss.on("connection", (ws, request) => {
      try {
        const authContext = this.authenticate(request);
        const clientContext: ClientContext = {
          ws,
          patientId: authContext.patientId,
          doctorSubscriptions: authContext.doctorSubscriptions
        };

        this.clients.add(clientContext);

        ws.on("close", () => {
          this.clients.delete(clientContext);
        });

        ws.on("error", () => {
          this.clients.delete(clientContext);
        });

        ws.send(
          JSON.stringify({
            event: "connected",
            patientId: clientContext.patientId
          })
        );
      } catch {
        ws.close(1008, "Unauthorized websocket client");
      }
    });
  }

  public broadcastAvailability(event: AvailabilityEventPayload): void {
    const envelope = {
      channel: "availability.updates",
      event: event.eventType ?? this.mapStatusToEvent(event.status),
      payload: event,
      timestamp: new Date().toISOString()
    };

    const serialized = JSON.stringify(envelope);
    for (const client of this.clients) {
      if (client.ws.readyState !== client.ws.OPEN) {
        continue;
      }

      const shouldSend =
        client.doctorSubscriptions.has(event.doctorId) ||
        (event.patientId !== null && event.patientId !== undefined && event.patientId === client.patientId);

      if (shouldSend) {
        client.ws.send(serialized);
      }
    }
  }

  private mapStatusToEvent(status: string): string {
    if (status === "available") {
      return "slot_opened";
    }
    if (status === "held") {
      return "slot_held";
    }
    if (status === "booked") {
      return "slot_booked";
    }
    return "slot_updated";
  }

  private authenticate(request: IncomingMessage): {
    patientId: string;
    doctorSubscriptions: Set<string>;
  } {
    const requestUrl = request.url ?? "/";
    const url = new URL(requestUrl, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      throw new Error("Missing token");
    }

    const claims = verifyToken(token, this.env.jwtAccessSecret, this.env.jwtIssuer);
    const doctorIds = url.searchParams.get("doctorIds");
    const doctorSubscriptions = new Set((doctorIds ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));

    return {
      patientId: claims.sub,
      doctorSubscriptions
    };
  }
}
