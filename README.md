# Hospital Patient Portal - Sprint 3

This repository contains the Sprint 3 version of the Hospital Patient Portal project. The product is a patient-facing web portal backed by multiple Node.js microservices, with Sprint 3 focused on finishing the remaining backlog after the Sprint 2 MVP.

## Sprint Summary

| Sprint | Focus | Outcome |
| --- | --- | --- |
| Sprint 1 | Requirements and backlog definition | Defined the core patient journey and prioritised MVP vs backlog items. |
| Sprint 2 | MVP delivery | Implemented registration, secure sign-in, profile completion, doctor browsing, slot hold and confirm, and appointment viewing. |
| Sprint 3 | Backlog completion | Added password recovery, dashboard summary, alternative login options, appointment cancellation, and medical records support. |

## Implemented Scope

### Patient features

- Register with email and password
- Sign in with email and password
- Request and verify OTP as a fallback sign-in flow
- Start Google sign-in when `GOOGLE_OAUTH_*` variables are configured
- Complete a required patient profile before using the full portal
- Browse doctors and available appointment slots
- Hold and confirm appointment slots
- View booked appointments
- Cancel appointments
- View a dashboard summary with quick actions
- Request a password reset link
- Reset password from a secure tokenised link
- View medical records
- Create medical records
- Update existing medical records

### Extra capabilities beyond the Sprint 3 brief

The codebase also includes staff-facing extensions that go beyond the patient portal stories in the sprint report:

- Doctor login, schedule management, and patient access views
- Admin staff invitations and staff management
- Admin views for doctors, patients, appointments, and audit logs

## Verified Sprint 3 Alignment

The Sprint 3 backlog in the report is represented in the codebase:

- Password reset request flow exists in `auth-service` and the patient `forgot-password` page.
- Password reset completion flow exists in `auth-service` and the patient `reset-password` page.
- Google sign-in and OTP fallback are both implemented in the auth service and patient login screen. Google OAuth is conditional on environment configuration.
- Patient dashboard summary exists in the web app and pulls profile, appointments, and record counts.
- Patient appointment cancellation exists in both the frontend and `appointment-service`.
- Medical record viewing, creation, and updating exist in the frontend and `medical-records-service`.

Implementation note:
The medical records API supports replacing record entries on update. The current patient UI clearly supports viewing entries, creating records with entries, and editing record metadata; entry editing is better supported in the API layer than in the current form UI.

## Architecture

### Frontend

- `apps/web`: React, Vite, Tailwind CSS, TanStack Query, Zustand

### Backend services

- `auth-service`: patient auth, OTP, Google OAuth, password reset, staff login
- `patient-service`: patient profile and onboarding gate support
- `doctor-service`: doctor directory, schedules, exceptions, doctor/admin tools
- `availability-service`: appointment slot availability
- `appointment-service`: hold, confirm, list, and cancel appointments
- `medical-records-service`: patient records and record updates
- `realtime-service`: WebSocket updates for live availability
- `notification-service`: email notifications through SMTP or Mailpit
- `audit-service`: audit log consumption and admin reporting support

### Shared packages

- `packages/common`: auth, DB, Redis, Kafka, HTTP, logging helpers
- `packages/contracts`: event contracts and OpenAPI definitions

### Infrastructure and ops

- `docker-compose.yml`: local full-stack environment
- `deploy/kong`: Kong gateway config
- `deploy/k8s`: Kubernetes manifests
- `infra/migrations`: database migrations and demo seed data
- `infra/terraform`: infrastructure scaffolding
- `ops/load-tests`: k6 load tests

## Repository Layout

```text
apps/
  web/
services/
  auth-service/
  patient-service/
  doctor-service/
  availability-service/
  appointment-service/
  medical-records-service/
  realtime-service/
  notification-service/
  audit-service/
packages/
  common/
  contracts/
infra/
  migrations/
  terraform/
deploy/
  kong/
  k8s/
ops/
  load-tests/
```

## Requirements

### Required tools

- Git
- Node.js 22 or later is recommended
- npm

### Required for Docker-based setup

- Docker Engine or Docker Desktop
- Docker Compose

Docker is required if you want to:

- build the project images
- run the full stack from `docker-compose.yml`
- run the services in containers instead of directly with `npm`

Without Docker, you cannot build Docker images. In that case, use the local development path below and run the required infrastructure yourself.

### Required for local development without Docker images

If you are not using Docker for the full stack, you still need these services available locally or from managed providers:

- PostgreSQL 16
- Redis 7
- Kafka
- Zookeeper if your local Kafka setup requires it
- Mailpit or another SMTP server for email testing

### Optional tools

- `k6` for load testing in `ops/load-tests`

## Running The Project

Choose one of these two paths:

- Docker setup: easiest way to run the whole stack locally
- Local setup without Docker images: run the app with `npm` and provide your own Postgres, Redis, Kafka, and SMTP/Mailpit

## Quick Start With Docker

### 1. Make sure Docker is installed

Check that Docker and Docker Compose are available:

```bash
docker --version
docker compose version
```

### 2. Install dependencies

```bash
npm install --workspaces --include-workspace-root
```

### 3. Start the full stack

To start the stack with seeded demo data:

```bash
SEED_DEMO_DATA=true npm run compose:up
```

If you do not need demo data:

```bash
npm run compose:up
```

Compose will build the images automatically. You do not need to run `docker build` separately unless you want to build images manually.

### 4. Open the local apps

- Frontend: `http://localhost:5173`
- API Gateway: `http://localhost:8000/api/v1`
- Kong Admin API: `http://localhost:8001`
- Mailpit Inbox: `http://localhost:8025`

### 5. Demo notes

- With `SEED_DEMO_DATA=true`, `patient@example.com` is seeded as a patient profile.
- The seeded patient is best accessed through OTP fallback on the login page unless you first set a password through the reset-password flow.
- In non-production mode, the OTP request response includes `devOtp`, and the same email is also visible in Mailpit.
- Google sign-in only works after `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI` are configured.

### 6. Stop the stack

```bash
npm run compose:down
```

## Building Docker Images Manually

Docker is required for these commands.

Build the frontend image:

```bash
docker build -f Dockerfile.web .
```

Build a backend service image:

```bash
docker build --build-arg SERVICE_NAME=auth-service -f Dockerfile.service .
```

## Local Development Without Docker For Every Service

### 1. Prepare environment variables

The repository includes `.env.example`. For host-run local development, copy it to `.env`:

```bash
cp .env.example .env
```

Important:

- `.env.example` uses `localhost` values and is intended for host-run local development
- `docker-compose.yml` already provides container-friendly defaults for the Docker path
- If you use a `.env` file with Docker Compose, do not leave database and service hosts as `localhost` unless that is really what you want

### 2. Start infrastructure dependencies

If you still want to use Docker just for dependencies:

```bash
docker compose up -d postgres redis zookeeper kafka mailpit
```

If you do not have Docker at all, start PostgreSQL, Redis, Kafka, and Mailpit/SMTP by some other local or hosted means before continuing.

### 3. Install packages

```bash
npm install --workspaces --include-workspace-root
```

### 4. Run migrations

```bash
npm run migrate
```

### 5. Optional demo seed

```bash
npm run seed
```

### 6. Start the frontend and backend workspaces

```bash
npm run dev
```

### 7. Open the app

- Frontend: `http://localhost:5173`
- Backend services: ports listed below

## Useful Scripts

- `npm run dev`
- `npm run dev:backend`
- `npm run build`
- `npm run typecheck`
- `npm run test`
- `npm run migrate`
- `npm run seed`
- `npm run compose:up`
- `npm run compose:down`

## Service Ports

- `web`: `5173`
- `auth-service`: `3001`
- `patient-service`: `3002`
- `doctor-service`: `3003`
- `availability-service`: `3004`
- `appointment-service`: `3005`
- `medical-records-service`: `3006`
- `realtime-service`: `3007`
- `notification-service`: `3008`
- `audit-service`: `3009`
- `kong`: `8000`

## API Areas Covered By The Gateway

- `POST /auth/patient/signup`
- `POST /auth/patient/login`
- `POST /auth/patient/forgot-password`
- `GET /auth/patient/reset-password/:token`
- `POST /auth/patient/reset-password`
- `POST /auth/request-otp`
- `POST /auth/verify-otp`
- `GET /auth/google/url`
- `POST /auth/google/exchange`
- `GET /patients/me/profile`
- `PATCH /patients/me/profile`
- `GET /doctors`
- `GET /doctors/:doctorId/availability`
- `POST /appointments/hold`
- `POST /appointments/confirm`
- `GET /appointments/me`
- `DELETE /appointments/:appointmentId`
- `GET /patients/me/records`
- `POST /patients/me/records`
- `PATCH /patients/me/records/:recordId`

## Verification

The repository includes unit tests for selected shared utilities and repository helpers. For a basic verification pass, run:

```bash
npm run test
npm run build
```

You can also run:

```bash
npm run typecheck
```

## Sprint 3 Conclusion

This repository matches the Sprint 3 project brief well for the patient portal journey. The main patient backlog items from Sprints 1 to 3 are present, and the repo also contains extra doctor and admin functionality that extends beyond the original sprint document.
