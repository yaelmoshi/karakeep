# Postgres and CNPG Port

Karakeep is currently SQLite-first at the application layer. CNPG support is
not a Helm-only change because the database package defines its schema with
`drizzle-orm/sqlite-core`, loads `better-sqlite3` directly, and runs SQLite
migrations from `packages/db/drizzle`.

## Current Boundaries

- `packages/db/schema.sqlite.ts` contains the current SQLite Drizzle schema.
- `packages/db/schema.ts` remains the public schema import path for existing
  application code.
- `packages/shared/config.ts` exposes `DB_DRIVER=sqlite|postgres` and
  `DATABASE_URL`; SQLite remains the default.
- `packages/db/drizzle.config.ts` selects SQLite generation output by default
  and Postgres generation output when `DB_DRIVER=postgres`.
- `packages/db/drizzle.ts` owns the live database connection and currently
  creates a synchronous `better-sqlite3` database. Postgres runtime mode fails
  intentionally until the Postgres schema and migrations exist.
- `packages/db/migrate.ts` runs SQLite migrations through the
  `better-sqlite3` migrator. Postgres migration mode fails intentionally until
  Postgres migrations exist.

## Porting Plan

1. Keep SQLite as the default backend for upstream compatibility.
2. Add explicit database selection through environment config:
   `DB_DRIVER=sqlite|postgres` and `DATABASE_URL`.
3. Add a Postgres Drizzle schema using `drizzle-orm/pg-core`, preserving table
   and column names where possible.
4. Add Postgres migrations generated from the Postgres schema; do not reuse
   SQLite migration SQL.
5. Replace exported SQLite-specific types and errors with database-neutral
   helpers.
6. Audit raw SQL and SQLite JSON functions before enabling Postgres runtime
   mode.
7. Add tests that run migrations and a representative application flow against
   Postgres before publishing a custom image.

## Notes

The app uses `await` around most database operations already, which helps the
eventual move to an async Postgres client. The main blockers are schema dialect,
migration history, SQLite-specific error handling, and raw SQL that uses SQLite
JSON functions.
