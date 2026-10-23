# Running Hiraman in containers

Containers run the server side of Hiraman (MySQL, the API and the LGU portal) the same way on any computer that has Docker. Nothing else needs installing: no Node, no MySQL. The phone app is still built separately (see `SETUP.md`) and connects to the API over the network.

| File | What it does |
|---|---|
| `Dockerfile` | Builds one image: the portal is built into static files, then served by the API on the same port |
| `docker-compose.yml` | Starts MySQL 8 and the API together, with the data kept in volumes |
| `docker-compose.dev.yml` | Development add-on: the API restarts when you save a file; MySQL is reachable on port 3307 |
| `docker.env.example` | The settings to copy to `docker.env` (passwords, login secret, contacts) |
| `docker/entrypoint.sh` | On every start: brings the database up to date (backing it up first), then starts the API |
| `.dockerignore` | Keeps secrets, uploads, backups and the phone app out of the image |

## First start

1. Install Docker Desktop (Windows or Mac) or Docker Engine (Linux).
2. In the project folder, copy the settings file and edit it:
   ```
   copy docker.env.example docker.env        (Windows)
   cp docker.env.example docker.env          (Mac, Linux)
   ```
   Change both passwords, and set `JWT_SECRET` to a long random string. The API will not start while it is still the example value. Fill in the Data Protection Officer details for the privacy notice.
3. Start everything:
   ```
   docker compose up -d --build
   ```
   The first start takes a few minutes: it builds the image, creates the database from `database/schema.sql`, and applies every migration.
4. Check it: open http://localhost:4000 (the portal) and http://localhost:4000/api/health (should say `"db":"ok"`).
5. Create the first admin account (the new database has no accounts):
   ```
   docker compose exec api npm run create-admin -- "Full Name" email@example.com
   ```
   It prints a temporary password once. Log in to the portal with it and choose your own. On a test install you can load the demo data instead (next section).

## Demo data (test installs only)

```
docker compose exec api npm run seed
```
This **replaces everything** with the demo residents, items and loans (password `hiraman123`). Never run it on a barangay's real install.

## Everyday use

| To | Run |
|---|---|
| See if it is running | `docker compose ps` |
| Read the logs (one line per request, with a request id) | `docker compose logs -f api` |
| Stop | `docker compose stop` |
| Start again | `docker compose start` |
| Update after pulling new code | `docker compose up -d --build` (migrations run by themselves, after a backup) |
| Back up now | `docker compose exec api npm run backup` |
| List backups | `docker compose exec api ls backups` |
| Restore a backup | `docker compose exec api npm run restore -- <folder> --yes` |
| Copy a backup to this computer | `docker compose cp api:/app/server/backups/<folder> ./my-backup` |

Data lives in three Docker volumes: `db-data` (the database), `uploads` (photos) and `backups`. They survive restarts, rebuilds and `docker compose down`. Only `docker compose down -v` deletes them.

## Connecting the phone app

The API listens on port 4000 of the computer running Docker. On the phone, set the server address (plug icon on the login screen) to `http://<that computer's address>:4000`, for example `http://192.168.137.1:4000` on the laptop hotspot. The phone app needs no `CORS_ORIGIN` entry.

## Development

```
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
The API restarts when you save a file in `server/src`, logs every request, and MySQL is open on `localhost:3307` (user `hiraman`, the password from `docker.env`) for MySQL Workbench. The tests still run outside the container: `cd server && npm test`.

## Good to know

- **Time zone:** the containers run in Philippine time (`TZ=Asia/Manila`); the API also sets it for every database connection.
- **Secrets:** `docker.env` holds real passwords and is ignored by git. Never put it in the image or in a chat.
- **HTTPS:** the containers serve plain HTTP, which is fine on a local network. Hosting on the internet needs HTTPS in front (a reverse proxy) first. The roadmap keeps that for later (decision S1).
- **Automatic checks:** every push to GitHub builds the image, starts both containers, and checks the health and the portal page (`.github/workflows/ci.yml`, job "Containers").

## When something goes wrong

| What you see | What to do |
|---|---|
| `api` keeps restarting, log says `JWT_SECRET must be set` | Put a long random value in `docker.env`, then `docker compose up -d` |
| `api` waits forever for `db` | `docker compose logs db`; often a wrong `MYSQL_ROOT_PASSWORD` after the database was first created. The password is fixed at first start; to start over on a test install: `docker compose down -v` |
| `Migration stopped` in the log | The database was backed up first. Read the message, fix the cause, and start again; to go back, use the restore command above |
| Port 4000 already in use | Stop the API you run outside Docker, or change `"4000:4000"` to `"4100:4000"` in `docker-compose.yml` |
| The phone cannot reach it | Same network? Windows firewall allows port 4000? Try `http://<address>:4000/api/health` in the phone's browser |
