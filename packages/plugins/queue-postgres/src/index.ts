import postgres from "postgres";
import type { Sql } from "postgres";

import type { PluginProvider } from "@karakeep/shared/plugins";
import type {
  DequeuedJob,
  EnqueueOptions,
  Queue,
  QueueClient,
  QueueOptions,
  Runner,
  RunnerFuncs,
  RunnerOptions,
} from "@karakeep/shared/queueing";
import serverConfig from "@karakeep/shared/config";
import { QueueRetryAfterError } from "@karakeep/shared/queueing";

interface QueueJobRow {
  id: string;
  payload: unknown;
  priority: number;
  run_number: number;
}

class PostgresQueueWrapper<T> implements Queue<T> {
  constructor(
    private readonly sql: Sql,
    private readonly _name: string,
    public readonly opts: QueueOptions,
  ) {}

  ensureInit(): Promise<void> {
    return Promise.resolve();
  }

  name(): string {
    return this._name;
  }

  async enqueue(
    payload: T,
    options?: EnqueueOptions,
  ): Promise<string | undefined> {
    const delayMs = options?.delayMs ?? 0;
    const rows = await this.sql<{ id: string }[]>`
      INSERT INTO "queueJobs" (
        "queueName",
        "payload",
        "priority",
        "maxRetries",
        "availableAt",
        "idempotencyKey",
        "groupId"
      )
      VALUES (
        ${this._name},
        ${this.sql.json(payload as postgres.JSONValue)},
        ${options?.priority ?? 0},
        ${this.opts.defaultJobArgs.numRetries},
        now() + (${delayMs}::double precision * interval '1 millisecond'),
        ${options?.idempotencyKey ?? null},
        ${options?.groupId ?? null}
      )
      ON CONFLICT ("queueName", "idempotencyKey")
        WHERE "idempotencyKey" IS NOT NULL
          AND "status" IN ('pending', 'running')
      DO NOTHING
      RETURNING "id"
    `;

    return rows[0]?.id;
  }

  async stats() {
    const rows = await this.sql<
      {
        pending: number;
        pending_retry: number;
        running: number;
        failed: number;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (
          WHERE "status" = 'pending'
            AND "availableAt" <= now()
        )::int AS "pending",
        COUNT(*) FILTER (
          WHERE "status" = 'pending'
            AND "availableAt" > now()
        )::int AS "pending_retry",
        COUNT(*) FILTER (WHERE "status" = 'running')::int AS "running",
        COUNT(*) FILTER (WHERE "status" = 'failed')::int AS "failed"
      FROM "queueJobs"
      WHERE "queueName" = ${this._name}
    `;

    return rows[0] ?? { pending: 0, pending_retry: 0, running: 0, failed: 0 };
  }

  async cancelAllNonRunning(): Promise<number> {
    const rows = await this.sql<{ id: string }[]>`
      DELETE FROM "queueJobs"
      WHERE "queueName" = ${this._name}
        AND "status" != 'running'
      RETURNING "id"
    `;
    return rows.length;
  }

  async claim(timeoutSecs: number): Promise<QueueJobRow | null> {
    const rows = await this.sql<QueueJobRow[]>`
      WITH next_job AS (
        SELECT "id"
        FROM "queueJobs"
        WHERE "queueName" = ${this._name}
          AND (
            "status" = 'pending'
            OR (
              "status" = 'running'
              AND "runningExpiresAt" <= now()
            )
          )
          AND "availableAt" <= now()
        ORDER BY "priority" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "queueJobs"
      SET
        "status" = 'running',
        "runNumber" = "runNumber" + 1,
        "runningExpiresAt" = now() + (${timeoutSecs}::double precision * interval '1 second'),
        "updatedAt" = now()
      FROM next_job
      WHERE "queueJobs"."id" = next_job."id"
      RETURNING
        "queueJobs"."id",
        "queueJobs"."payload",
        "queueJobs"."priority",
        "queueJobs"."runNumber" AS "run_number"
    `;

    return rows[0] ?? null;
  }

  async complete(id: string) {
    await this.sql`
      DELETE FROM "queueJobs"
      WHERE "id" = ${id}
    `;
  }

  async retryAfter(id: string, delayMs: number) {
    await this.sql`
      UPDATE "queueJobs"
      SET
        "status" = 'pending',
        "runNumber" = GREATEST("runNumber" - 1, 0),
        "availableAt" = now() + (${delayMs}::double precision * interval '1 millisecond'),
        "runningExpiresAt" = NULL,
        "updatedAt" = now()
      WHERE "id" = ${id}
    `;
  }

  async failOrRetry(id: string, error: Error, keepFailedJobs: boolean) {
    const rows = await this.sql<
      { should_retry: boolean; run_number: number; max_retries: number }[]
    >`
      SELECT
        "runNumber" <= "maxRetries" AS "should_retry",
        "runNumber" AS "run_number",
        "maxRetries" AS "max_retries"
      FROM "queueJobs"
      WHERE "id" = ${id}
    `;
    const row = rows[0];
    if (!row) {
      return { numRetriesLeft: 0 };
    }

    if (row.should_retry) {
      await this.sql`
        UPDATE "queueJobs"
        SET
          "status" = 'pending',
          "availableAt" = now(),
          "runningExpiresAt" = NULL,
          "lastError" = ${error.message},
          "updatedAt" = now()
        WHERE "id" = ${id}
      `;
    } else if (keepFailedJobs) {
      await this.sql`
        UPDATE "queueJobs"
        SET
          "status" = 'failed',
          "runningExpiresAt" = NULL,
          "lastError" = ${error.message},
          "updatedAt" = now()
        WHERE "id" = ${id}
      `;
    } else {
      await this.sql`
        DELETE FROM "queueJobs"
        WHERE "id" = ${id}
      `;
    }

    return {
      numRetriesLeft: Math.max(row.max_retries - row.run_number, 0),
    };
  }
}

class PostgresRunner<T, R = void> implements Runner<T> {
  private stopped = false;

  constructor(
    private readonly queue: PostgresQueueWrapper<T>,
    private readonly funcs: RunnerFuncs<T, R>,
    private readonly opts: RunnerOptions<T>,
  ) {}

  async run(): Promise<void> {
    const running = new Set<Promise<void>>();

    while (!this.stopped) {
      while (!this.stopped && running.size < this.opts.concurrency) {
        const job = await this.queue.claim(this.opts.timeoutSecs);
        if (!job) {
          break;
        }

        const promise = this.runJob(job).finally(() => running.delete(promise));
        running.add(promise);
      }

      if (running.size === 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.opts.pollIntervalMs ?? 1000),
        );
      } else {
        await Promise.race(running);
      }
    }

    await Promise.allSettled(running);
  }

  stop(): void {
    this.stopped = true;
  }

  async runUntilEmpty(): Promise<void> {
    while (true) {
      const job = await this.queue.claim(this.opts.timeoutSecs);
      if (!job) {
        break;
      }
      await this.runJob(job);
    }
  }

  private async runJob(job: QueueJobRow) {
    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(),
      this.opts.timeoutSecs * 1000,
    );
    const dequeuedJob: DequeuedJob<T> = {
      id: job.id,
      data: job.payload as T,
      priority: job.priority,
      runNumber: job.run_number,
      abortSignal: abortController.signal,
    };

    try {
      const result = await this.funcs.run(dequeuedJob);
      await this.queue.complete(job.id);
      await this.funcs.onComplete?.(dequeuedJob, result);
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      if (normalizedError instanceof QueueRetryAfterError) {
        await this.queue.retryAfter(job.id, normalizedError.delayMs);
        return;
      }
      const { numRetriesLeft } = await this.queue.failOrRetry(
        job.id,
        normalizedError,
        this.queue.opts.keepFailedJobs,
      );
      await this.funcs.onError?.({
        ...dequeuedJob,
        error: normalizedError,
        numRetriesLeft,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

class PostgresQueueClient implements QueueClient {
  private sql: Sql;
  private queues = new Map<string, PostgresQueueWrapper<unknown>>();

  constructor() {
    this.sql = serverConfig.database.url
      ? postgres(serverConfig.database.url, { max: 10, prepare: false })
      : postgres({
          host: serverConfig.database.postgres.host,
          port: serverConfig.database.postgres.port,
          database: serverConfig.database.postgres.database,
          username: serverConfig.database.postgres.user,
          password: serverConfig.database.postgres.password,
          ssl: serverConfig.database.postgres.ssl,
          max: 10,
          prepare: false,
        });
  }

  async prepare(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS "queueJobs" (
        "id" bigserial PRIMARY KEY,
        "queueName" text NOT NULL,
        "payload" jsonb NOT NULL,
        "priority" integer NOT NULL DEFAULT 0,
        "status" text NOT NULL DEFAULT 'pending',
        "runNumber" integer NOT NULL DEFAULT 0,
        "maxRetries" integer NOT NULL,
        "availableAt" timestamptz NOT NULL DEFAULT now(),
        "runningExpiresAt" timestamptz,
        "idempotencyKey" text,
        "groupId" text,
        "lastError" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `;
    await this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "queueJobs_active_idempotency_idx"
      ON "queueJobs" ("queueName", "idempotencyKey")
      WHERE "idempotencyKey" IS NOT NULL
        AND "status" IN ('pending', 'running')
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS "queueJobs_claim_idx"
      ON "queueJobs" ("queueName", "status", "availableAt", "priority", "id")
    `;
  }

  async start(): Promise<void> {
    // No-op. Postgres runners poll from the application process.
  }

  createQueue<T>(name: string, options: QueueOptions): Queue<T> {
    if (this.queues.has(name)) {
      throw new Error(`Queue ${name} already exists`);
    }

    const queue = new PostgresQueueWrapper<T>(this.sql, name, options);
    this.queues.set(name, queue as PostgresQueueWrapper<unknown>);
    return queue;
  }

  createRunner<T, R = void>(
    queue: Queue<T>,
    funcs: RunnerFuncs<T, R>,
    opts: RunnerOptions<T>,
  ): Runner<T> {
    const wrapper = this.queues.get(queue.name());
    if (!wrapper) {
      throw new Error(`Queue ${queue.name()} not found`);
    }
    return new PostgresRunner<T, R>(
      wrapper as PostgresQueueWrapper<T>,
      funcs,
      opts,
    );
  }

  async shutdown(): Promise<void> {
    await this.sql.end();
  }
}

export class PostgresQueueProvider implements PluginProvider<QueueClient> {
  private client: QueueClient | null = null;

  async getClient(): Promise<QueueClient | null> {
    if (!this.client) {
      this.client = new PostgresQueueClient();
    }
    return this.client;
  }
}
