# pg-boss

## What it is

pg-boss is a PostgreSQL-backed job queue for Node.js. It stores jobs as rows in PostgreSQL tables, provides reliable delivery with retries, expiration, and back-off, and requires no external infrastructure beyond the database Spotter already runs. Jobs are inserted with `boss.send()` and processed with `boss.work()` in a separate worker process.

Spotter uses pg-boss to **move email delivery out of the HTTP request path**. Instead of sending the verification email synchronously during signup (blocking the response and risking a timeout), the service inserts a job into the queue, and a background worker picks it up.

## Why Spotter chose it

| Requirement | How pg-boss satisfies it |
| --- | --- |
| No extra infrastructure | pg-boss stores everything in PostgreSQL. Spotter already runs Postgres, so there is no need for Redis, RabbitMQ, or a separate queue service. |
| Transactional enqueue | `boss.send()` accepts a Prisma transaction client via `{ db: fromPrisma(tx) }`, so the user row and the email job are committed atomically. If the user insert fails, the job is never created. |
| Automatic retries | Failed jobs are retried with configurable limits, delays, and exponential back-off. The verification email queue retries up to 5 times. |
| Job expiration | If a worker does not complete a job within `expireInSeconds`, pg-boss marks it as failed and retries it, preventing stuck jobs from blocking the queue. |
| Separate worker process | `boss.work()` runs in a dedicated Node.js process (`npm run worker:email`), isolating email delivery from the API server's event loop. |
| Job retention and cleanup | `retentionSeconds` and `deleteAfterSeconds` control how long completed and deleted jobs stay in the database, keeping the queue table small. |

## How Spotter uses it

### Queue setup

[`src/queues/queue.js`](../../../backend/src/queues/queue.js) creates the pg-boss instance and defines the queue:

```js
import { PgBoss } from "pg-boss";

export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
});

export const VERIFICATION_EMAIL_QUEUE = "verification-email";

const VERIFICATION_EMAIL_QUEUE_OPTIONS = {
  retryLimit: 5,
  retryDelay: 30,         // seconds before first retry
  retryBackoff: true,     // exponential back-off on subsequent retries
  expireInSeconds: 60,    // max time for a single job attempt
  retentionSeconds: 86400,   // keep completed jobs for 24 hours
  deleteAfterSeconds: 3600,  // delete completed jobs after 1 hour
};

export async function startQueue() {
  await boss.start();
  await boss.createQueue(VERIFICATION_EMAIL_QUEUE, VERIFICATION_EMAIL_QUEUE_OPTIONS);
  await boss.updateQueue(VERIFICATION_EMAIL_QUEUE, VERIFICATION_EMAIL_QUEUE_OPTIONS);
}
```

`createQueue` is idempotent — it does nothing if the queue exists. `updateQueue` follows immediately to apply any configuration changes to environments where the queue was already created.

### Enqueuing a job (inside a Prisma transaction)

[`src/modules/auth/auth.service.js`](../../../backend/src/modules/auth/auth.service.js) enqueues the email job atomically with the user insert:

```js
import { fromPrisma } from "pg-boss";

await prisma.$transaction(async (tx) => {
  const user = await createUser({ ... }, tx);

  await boss.send(
    VERIFICATION_EMAIL_QUEUE,
    {
      userId: user.id,
      encryptedToken,
      verificationTokenHash: verificationToken.hashedToken,
    },
    { db: fromPrisma(tx) }    // ← uses the same DB transaction
  );
});
```

The `fromPrisma(tx)` adapter is the key feature: it tells pg-boss to insert the job row using the Prisma transaction client, so the user row and the job row share the same database transaction. If anything in the transaction fails, both roll back.

### Queue payload encryption

The raw verification token cannot be stored in the job payload in plain text — anyone with database read access could forge verification links. [`src/queues/queueCrypto.js`](../../../backend/src/queues/queueCrypto.js) encrypts the token with AES-256-GCM before it enters the queue, and the worker decrypts it just before sending the email.

### Processing jobs (worker process)

[`src/workers/email.worker.js`](../../../backend/src/workers/email.worker.js) runs as a separate Node.js process:

```js
await startQueue();

await boss.work(VERIFICATION_EMAIL_QUEUE, async ([job]) => {
  const { userId, encryptedToken, verificationTokenHash } = job.data;

  // 1. Check if this is still the user's current verification token
  const user = await findPendingVerificationEmailRecipient({ userId, verificationTokenHash });
  if (!user) return;   // token was replaced (user requested another email)

  // 2. Decrypt and verify the token
  const rawToken = decryptQueueToken(encryptedToken);
  // ...hash check...

  // 3. Send the email
  await sendVerificationEmail({ email: user.email, username: user.username, rawToken });
});
```

This worker is started with `npm run worker:email` (defined in `package.json`).

### Architecture

```text
signup request
  └── Prisma $transaction
      ├── createUser(tx)
      └── boss.send(queue, payload, { db: fromPrisma(tx) })
                                      │
                                      ▼
                            PostgreSQL (same transaction)
                                      │
                                      ▼
                         email.worker.js → boss.work()
                              ├── decrypt token
                              ├── verify against DB
                              └── sendVerificationEmail()
```

## API currently used

| API | Spotter purpose |
| --- | --- |
| `new PgBoss({ connectionString })` | Create the pg-boss instance connected to the same database. |
| `boss.start()` | Initialize pg-boss internal tables and begin queue management. |
| `boss.createQueue(name, options)` | Create the verification email queue with retry/expiry settings. |
| `boss.updateQueue(name, options)` | Apply configuration updates to an existing queue. |
| `boss.send(queue, data, options)` | Enqueue a job. With `{ db: fromPrisma(tx) }`, the insert joins a Prisma transaction. |
| `boss.work(queue, handler)` | Register a handler that processes jobs from the queue. |
| `boss.on("error", handler)` | Global error listener for unexpected queue errors. |
| `fromPrisma(tx)` | Adapter that converts a Prisma transaction client into a pg-boss-compatible DB handle. |

## What it can do next

- **Additional queues** — Add queues for password-reset emails, welcome emails, push notifications, or any background work that should not block the API response.
- **`boss.schedule()`** — Create recurring (cron-like) jobs, e.g., daily cleanup of expired unverified accounts.
- **Dead-letter queues** — Move permanently failed jobs to a dead-letter queue for manual inspection instead of deleting them.
- **Monitoring** — Use `boss.getQueueSize()` and `boss.getQueue()` to build a simple admin dashboard showing queue health.
- **`boss.complete()` / `boss.fail()`** — Explicitly complete or fail jobs for finer-grained control beyond the handler's return value.
- **Batch processing** — `boss.work(queue, { batchSize: N }, handler)` processes multiple jobs at once, which can improve throughput for high-volume queues.
- **Priority** — `boss.send()` accepts a `priority` option to process high-priority jobs first.
- **Singleton jobs** — Use `singletonKey` to ensure only one job with a given key exists at a time, useful for preventing duplicate email sends.

## Operational notes

- pg-boss creates its own tables in the database (`pgboss.job`, `pgboss.queue`, etc.) under the `pgboss` schema. No Prisma migration is needed for these tables.
- The worker must be started separately from the API server (`npm run worker:email`). In production, it should be a separate process with its own monitoring and restart policy.
- If the worker crashes, no jobs are lost — they remain in the database and will be picked up when the worker restarts.
- Jobs that exceed `expireInSeconds` are marked as failed and retried according to `retryLimit`. The current 60-second expiry is generous for a single SMTP send.
- `retentionSeconds` (24 hours) controls how long *completed* jobs stay visible. `deleteAfterSeconds` (1 hour) controls when they are physically deleted. This keeps the queue table lean.
- The `fromPrisma()` adapter requires the `pg-boss` package itself — it is exported directly from the `pg-boss` package entry point.

## Official references

- [pg-boss GitHub repository](https://github.com/timgit/pg-boss)
- [pg-boss documentation](https://timgit.github.io/pg-boss/)
- [pg-boss Prisma integration](https://github.com/timgit/pg-boss/blob/master/docs/readme.md#prisma)
