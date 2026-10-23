#!/bin/sh
# Starts the Hiraman API in a container: brings the database up to date first (with a backup, except on a
# brand-new database), then runs the given command (the API by default).
set -e

# docker.env names the database password once, as MYSQL_PASSWORD (the MySQL image reads that name too).
export DB_PASSWORD="${DB_PASSWORD:-$MYSQL_PASSWORD}"

node scripts/migrate.js up
exec "$@"
