import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import type { Queue, QueueClient } from "@karakeep/shared/queueing";

type TestAction =
  | { type: "value"; value: number }
  | { type: "error"; message: string }
  | { type: "delay"; value: number; durationMs: number }
  | { type: "retry-after"; value: number; delayMs: number }
  | { type: "block"; value: number };

const postgresUrl = process.env.KARAKEEP_TEST_POSTGRES_URL;
const describeIfPostgres = postgresUrl ? describe : describe.skip;

class Baton {
  private resolvePromise: () => void = () => {
    /* noop */
  };
  private readonly promise = new Promise<void>((resolve) => {
    this.resolvePromise = resolve;
  });
  private waiting = 0;

  async wait() {
    this.waiting++;
    await this.promise;
  }

  release() {
    this.resolvePromise();
  }

  async waitUntilWaiting(expected: number) {
    const deadline = Date.now() + 5000;
    while (this.waiting < expected) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${expected} blocked jobs`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

async function waitUntil(fn: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 10000;
  while (!(await fn())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describeIfPostgres("Postgres Queue Provider", () => {
  let queueClient: QueueClient;
  let queue: Queue<TestAction>;
  let sql: postgres.Sql;
  let queueName: string;
  let baton: Baton;
  let results: number[];
  let errors: string[];
  let inFlight: number;
  let maxInFlight: number;
  let retryAfterAttempts: Map<string, number>;
  let QueueRetryAfterError: typeof import("@karakeep/shared/queueing").QueueRetryAfterError;

  async function resetQueue() {
    await sql`DELETE FROM "queueJobs" WHERE "queueName" = ${queueName}`;
  }

  function createRunner(concurrency = 3, timeoutSecs = 2, blockJobs = true) {
    return queueClient.createRunner(
      queue,
      {
        run: async (job) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);

          const action = job.data;
          switch (action.type) {
            case "value":
              return action.value;
            case "error":
              throw new Error(action.message);
            case "delay":
              await new Promise((resolve) =>
                setTimeout(resolve, action.durationMs),
              );
              return action.value;
            case "retry-after": {
              const attempts = retryAfterAttempts.get(job.id) ?? 0;
              retryAfterAttempts.set(job.id, attempts + 1);
              if (attempts === 0) {
                throw new QueueRetryAfterError("retry later", action.delayMs);
              }
              return action.value;
            }
            case "block":
              if (blockJobs) {
                await baton.wait();
              }
              return action.value;
          }
        },
        onComplete: async (_job, result) => {
          inFlight--;
          if (typeof result === "number") {
            results.push(result);
          }
        },
        onError: async (job) => {
          inFlight--;
          errors.push(job.error.message);
        },
      },
      { concurrency, timeoutSecs, pollIntervalMs: 25 },
    );
  }

  beforeAll(async () => {
    if (!postgresUrl) {
      return;
    }

    process.env.DB_DRIVER = "postgres";
    process.env.DATABASE_URL = postgresUrl;
    process.env.NO_COLOR = "false";

    sql = postgres(postgresUrl, { max: 1, prepare: false });
    ({ QueueRetryAfterError } = await import("@karakeep/shared/queueing"));
    const { PostgresQueueProvider } = await import("../index");
    const client = await new PostgresQueueProvider().getClient();
    if (!client) {
      throw new Error("Failed to create Postgres queue client");
    }

    queueClient = client;
    queueName = `test-queue-${Date.now()}`;
    queue = queueClient.createQueue<TestAction>(queueName, {
      defaultJobArgs: { numRetries: 2 },
      keepFailedJobs: false,
    });
    await queueClient.prepare();
  });

  beforeEach(async () => {
    baton = new Baton();
    results = [];
    errors = [];
    inFlight = 0;
    maxInFlight = 0;
    retryAfterAttempts = new Map<string, number>();
    await resetQueue();
  });

  afterEach(async () => {
    await resetQueue();
  });

  afterAll(async () => {
    if (queueClient?.shutdown) {
      await queueClient.shutdown();
    }
    if (sql) {
      await sql.end();
    }
  });

  it("enqueues and processes jobs", async () => {
    const runner = createRunner();
    await queue.enqueue({ type: "value", value: 1 });
    await queue.enqueue({ type: "value", value: 2 });

    await runner.runUntilEmpty?.();

    expect(results).toEqual([1, 2]);
    expect(await queue.stats()).toEqual({
      pending: 0,
      pending_retry: 0,
      running: 0,
      failed: 0,
    });
  });

  it("keeps active idempotency keys unique", async () => {
    const first = await queue.enqueue(
      { type: "value", value: 1 },
      { idempotencyKey: "same-key" },
    );
    const second = await queue.enqueue(
      { type: "value", value: 2 },
      { idempotencyKey: "same-key" },
    );

    await createRunner().runUntilEmpty?.();

    expect(first).toBeDefined();
    expect(second).toBeUndefined();
    expect(results).toEqual([1]);
  });

  it("tracks delayed jobs separately from ready jobs", async () => {
    await queue.enqueue({ type: "value", value: 1 }, { delayMs: 5000 });

    expect(await queue.stats()).toMatchObject({
      pending: 0,
      pending_retry: 1,
      running: 0,
      failed: 0,
    });
  });

  it("retries failed jobs and reports retry exhaustion", async () => {
    await queue.enqueue({ type: "error", message: "boom" });
    await createRunner().runUntilEmpty?.();

    expect(errors).toEqual(["boom", "boom", "boom"]);
    expect(await queue.stats()).toMatchObject({ failed: 0 });
  });

  it("handles QueueRetryAfterError without consuming a retry", async () => {
    await queue.enqueue({ type: "retry-after", value: 42, delayMs: 50 });
    await createRunner().runUntilEmpty?.();

    await waitUntil(async () => {
      const stats = await queue.stats();
      return stats.pending === 1;
    }, "retry-after job to become ready");

    await createRunner().runUntilEmpty?.();

    expect(results).toEqual([42]);
    expect(errors).toEqual([]);
  });

  it("runs jobs concurrently up to the runner concurrency", async () => {
    const runner = createRunner(3);
    for (let i = 0; i < 6; i++) {
      await queue.enqueue({ type: "delay", value: i, durationMs: 100 });
    }

    const run = runner.run();
    await waitUntil(async () => results.length === 6, "all jobs to complete");
    runner.stop();
    await run;

    expect(results).toHaveLength(6);
    expect(maxInFlight).toBe(3);
  });

  it("cancels queued non-running jobs", async () => {
    await queue.enqueue({ type: "value", value: 1 });
    await queue.enqueue({ type: "value", value: 2 }, { delayMs: 1000 });

    await expect(queue.cancelAllNonRunning?.()).resolves.toBe(2);
    expect(await queue.stats()).toEqual({
      pending: 0,
      pending_retry: 0,
      running: 0,
      failed: 0,
    });
  });

  it("recovers expired running leases", async () => {
    const firstRunner = createRunner(1, 1);
    const secondRunner = createRunner(1, 1, false);

    await queue.enqueue({ type: "block", value: 1 });
    const firstRun = firstRunner.run();
    await baton.waitUntilWaiting(1);

    const secondRun = secondRunner.run();
    await waitUntil(async () => results.includes(1), "lease recovery");

    secondRunner.stop();
    baton.release();
    firstRunner.stop();
    await Promise.allSettled([firstRun, secondRun]);

    expect(results).toContain(1);
  });
});
