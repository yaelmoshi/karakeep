CREATE TABLE "queueJobs" (
	"id" bigserial PRIMARY KEY,
	"queueName" text NOT NULL,
	"payload" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"runNumber" integer DEFAULT 0 NOT NULL,
	"maxRetries" integer NOT NULL,
	"availableAt" timestamp with time zone DEFAULT now() NOT NULL,
	"runningExpiresAt" timestamp with time zone,
	"idempotencyKey" text,
	"groupId" text,
	"lastError" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "queueJobs_active_idempotency_idx" ON "queueJobs" ("queueName","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL AND "status" IN ('pending', 'running');
--> statement-breakpoint
CREATE INDEX "queueJobs_claim_idx" ON "queueJobs" ("queueName","status","availableAt","priority","id");
