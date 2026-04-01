# Patient-Centric Hospital Platform (MVP Core)

A microservice-based hospital platform focused on patient self-service with:

- Dynamic appointment booking with strict slot hold/confirm semantics
- Secure patient portal for personal medical records
- Email OTP and Google OAuth sign-in
- Real-time doctor availability updates over WebSocket
- Event-driven stateless services with Kafka, retries, DLQs, and schema validation
- API Gateway (Kong) with rate limiting, JWT auth, request tracing, and reverse proxy routing
- PostgreSQL + Redis + Docker + Kubernetes + Terraform scaffolding

## Tech Stack

- Frontend: React + Tailwind CSS + Vite + TanStack Query + Zustand
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL 16 using mostly raw SQL via `pg`
- Messaging: Apache Kafka (event backbone) with schema-validated contracts and DLQs
- Cache and locking: Redis 7
- Gateway: Kong (declarative config with correlation IDs and request logging)
- Email: SMTP via `notification-service` (Mailpit locally)
- Infra: Docker Compose (local), Kubernetes manifests, Terraform (AWS)

## Repository Layout

- `apps/web`: Patient-facing React app
- `services/*`: Independent stateless microservices
- `packages/common`: Shared backend utilities (auth, db, kafka, redis, http)
- `packages/contracts`: OpenAPI and event contracts
- `infra/migrations`: Knex-based SQL migrations and seed data
- `deploy/kong`: Kong declarative gateway config
- `deploy/k8s`: Kubernetes manifests and autoscaling configs
- `infra/terraform`: AWS infrastructure scaffolding (EKS, Aurora, Redis, MSK, backup)
- `ops/load-tests`: k6 load test scripts

## Services and Ports

- `auth-service` (3001)
- `patient-service` (3002)
- `doctor-service` (3003)
- `availability-service` (3004)
- `appointment-service` (3005)
- `medical-records-service` (3006)
- `realtime-service` (3007)
- `notification-service` (3008)
- `audit-service` (3009)
- `kong` gateway (8000)
- `web` frontend (5173)

## Quick Start (Docker)

1. Create `.env` from `.env.example` if needed.
2. Start everything:

```bash
npm run compose:up
```

3. Open:

- Frontend: `http://localhost:5173`
- API Gateway: `http://localhost:8000/api/v1`
- Kong Admin API: `http://localhost:8001`
- Mailpit Inbox: `http://localhost:8025`

4. Demo login flow:

- Use `patient@example.com`
- `POST /auth/request-otp` returns `devOtp` in non-production mode and sends the email to Mailpit locally
- Google OAuth becomes available once `GOOGLE_OAUTH_*` env vars are configured

## Local Development (without Docker for services)

1. Install dependencies:

```bash
npm install --workspaces --include-workspace-root
```

2. Start dependencies (`postgres`, `redis`, `kafka`) via Docker Compose or managed services.

3. Run migrations and seed:

```bash
npm run migrate
npm run seed
```

4. Start backend and frontend:

```bash
npm run dev
```

## Core API Endpoints (Gateway)

- `POST /api/v1/auth/request-otp`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/patients/me/profile`
- `GET /api/v1/patients/me/records`
- `GET /api/v1/patients/me/records/{recordId}`
- `GET /api/v1/doctors/{doctorId}/availability?start=&end=`
- `POST /api/v1/appointments/hold`
- `POST /api/v1/appointments/confirm`
- `GET /api/v1/appointments/me`
- `DELETE /api/v1/appointments/{appointmentId}`

## Event Topics

- `appointment.hold.created`
- `appointment.confirmed`
- `appointment.cancelled`
- `doctor.availability.updated`
- `medical_record.created`
- `notification.requested`
- `audit.event.logged`
- DLQs use the topic suffix `.dlq`

## Reliability and Scalability Highlights

- Strict slot locking with Redis (`SET NX EX`) + DB transaction checks
- Transactional outbox table for appointment event publishing
- Consumer retries with exponential backoff and dead-letter topics
- Redis read-through caching for availability (30s) and records (60s)
- Idempotent confirm endpoint via `idempotency-key`
- Horizontal Pod Autoscaler templates for all services
- Terraform skeleton includes multi-AZ Aurora/Redis/MSK and AWS Backup vault plan

## Security Baseline

- JWT access + refresh tokens
- OTP email login flow
- Auth middleware supports bearer token and secure cookie flow
- Audit logging for profile and records access events

## Testing

Run all tests:

```bash
npm run test
```

Load test example (`k6` required):

```bash
k6 run ops/load-tests/appointments.js -e BASE_URL=http://localhost:8000/api/v1 -e ACCESS_TOKEN=<token>
```
