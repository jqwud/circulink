<p align="center"><img src="brand/logo.svg" alt="CircuLink" width="360"></p>

<p align="center"><a href="https://github.com/jqwud/circulink/actions/workflows/ci.yml"><img src="https://github.com/jqwud/circulink/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI/CD"></a></p>

**Keep it in the loop.** CircuLink is a drop-off hub system that keeps items in use and out of the landfill. Residents bring things they no longer need to a hub at a school or barangay. Hub staff weigh each item and sort it: **reuse, repair, recycle or reject**. Reusable items go to verified partner organizations (shelters, schools, NGOs), and recyclables go to recyclers. Everything is weighed, so the main measure is **kilograms kept in use**.

Built for **SDG 12: Responsible Consumption and Production** ("do more and better with less"). It covers targets 12.2 (efficient use of resources), 12.3 (food waste), 12.4 (hazardous waste), 12.5 (reduce, reuse, recycle), 12.6 (reporting) and 12.8 (awareness). The full design is in [`docs/CIRCULAR_HUB_SPEC.md`](docs/CIRCULAR_HUB_SPEC.md).

The app and portal work in **English and Filipino**.

## Fair by design

Points can't be gamed:

- **Only hub staff create points**, and only after physically weighing real items. Residents never confirm anything that earns points.
- **Only approved partner organizations receive items.** Residents can't receive items, so nobody can give to themselves or to a second account.
- **One account per email, per phone number and per student ID.**
- Staff can't process their own drop-offs, unusual weights are flagged for an admin, and every change goes into an append-only audit log.
- Points can't be transferred and have no cash value.

The rules are numbered R1 to R13 in the spec, and each one has an automated test.

## What is in this folder

| Folder | What it is |
|---|---|
| `app/` | The **resident mobile app** (Flutter, Android): declare items and get a drop-off code, follow each item, see your impact and badge, read the sorting guide. |
| `portal/` | The **web portal** (React): hub staff check in, weigh and sort; partner organizations ask for items; admins manage hubs, accounts, flags and the monthly impact report. |
| `server/` | The **API** (Node.js + Express) that both use. |
| `database/` | The **MySQL** schema (`schema.sql`), numbered migrations, and local database setup (`create-test-db.sql`). |
| `brand/` | The logo, icons and colors, one source for the app and the portal (`node build-brand.mjs`, `node build-icons.mjs`). |
| `docs/` | `CIRCULAR_HUB_SPEC.md` (what we are building), `SETUP.md` (how to run it), `CONTAINERS.md` (Docker), `CICD.md` (the pipeline), `ARCHITECTURE.md` (how it fits together), `DESIGN_SYSTEM.md` (how it looks), `RELEASE.md`, `CHANGELOG.md`. |
| `Dockerfile`, `docker-compose*.yml` | MySQL, the API and the portal in containers. |
| `.github/workflows/ci.yml` | The CI/CD pipeline: checks on every push and pull request, and the image published to GHCR from `main` and `v*` tags. |

## Quick start

See **[`docs/SETUP.md`](docs/SETUP.md)** for the step-by-step version. In short:

1. Install Node.js 22+ and MySQL 8, then run `mysql -u root -p -e "SET @pw = 'your-password'; source database/create-test-db.sql"` once (it creates the `circulink` account and databases).
2. `mysql -u root -p < database/schema.sql`, then in `server/`: copy `.env.example` to `.env`, fill in the database login, then `npm install`, `npm run migrate`, `npm run seed:demo`, `npm start`.
3. In `portal/`: `npm install`, `npm run build`. Open http://localhost:4000.
4. In `app/`: plug in an Android phone and double-click `run-phone.cmd`, or run `flutter run -d chrome`.
5. Tests: `cd server && npm test`, `cd portal && npm run test:e2e`, `cd app && flutter test`.

Or, with Docker only: copy `docker.env.example` to `docker.env`, edit it, and run `docker compose up -d --build` ([`docs/CONTAINERS.md`](docs/CONTAINERS.md)).

## Demo accounts (password for all: `circulink123`)

| Who | Email | Where |
|---|---|---|
| Admin | `admin@circulink.test` | Portal |
| Hub staff (Campus Green Hub, Barangay San Isidro MRF) | `staff@circulink.test`, `staff2@circulink.test` | Portal |
| Partner organization (approved) | `partner@circulink.test` | Portal |
| Partner organization (waiting for approval) | `partner2@circulink.test` | Portal |
| Residents | `ana@`, `ben@`, `carlo@circulink.test` | App |

`npm run seed:demo` loads these accounts with six months of drop-offs, so the reports, badges, stock, a partner request and a flag to review all have something in them. `npm run seed` loads the accounts only.

## CI/CD

Every push and pull request runs the API tests on a real MySQL (including one group of tests per rule, R1 to R13), the app and portal checks, a container build with a health check, and end-to-end tests of the portal and the app. When all of that passes on `main` or on a `v*` tag, the pipeline publishes the Docker image to `ghcr.io/jqwud/circulink`. Pull requests are checked but never published. Details, and how to run the published image, are in [`docs/CICD.md`](docs/CICD.md).

## Build status

All nine steps of the [build order](docs/CIRCULAR_HUB_SPEC.md#10-build-order) are done. What changed in each is in [`docs/CHANGELOG.md`](docs/CHANGELOG.md).
