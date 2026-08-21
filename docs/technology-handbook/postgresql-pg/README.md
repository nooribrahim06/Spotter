# PostgreSQL, node-postgres, and PrismaPg

## What it is

Spotter's persistence stack contains three distinct layers:

```text
Prisma Client
    ↓
@prisma/adapter-pg (PrismaPg)
    ↓
pg (node-postgres Pool)
    ↓
PostgreSQL server
```

- **PostgreSQL** is the relational database that owns durable data, constraints, indexes, transactions, and SQL execution.
- **`pg`**, also called node-postgres, is a JavaScript PostgreSQL driver with connection and pooling APIs.
- **`@prisma/adapter-pg`** translates Prisma Client operations to the `pg` driver interface.

## How Spotter uses it

[`src/lib/prisma.js`](../../../backend/src/lib/prisma.js) creates a pool from `DATABASE_URL`, wraps it in the adapter, and gives that adapter to Prisma Client:

```js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
```

The pool manages reusable database connections. Prisma Client acquires database access through the adapter rather than through raw `pool.query()` calls in feature modules.

[`schema.prisma`](../../../backend/prisma/schema.prisma) uses PostgreSQL-native representations including:

- `@db.Uuid` for account IDs.
- `@db.VarChar(n)` for bounded strings.
- `@db.Timestamptz(6)` for timezone-aware instants.
- Unique constraints for email and username.
- An enum for account roles.

## Database responsibilities in signup

During signup, PostgreSQL:

1. Inserts the user atomically.
2. Generates and stores defaults.
3. Enforces UUID primary-key integrity.
4. Enforces unique email and username constraints.
5. Stores verification expiry and audit timestamps as timezone-aware values.
6. Either commits the row or rejects the insert.

This is why uniqueness is not implemented as only an application-level pre-check. Concurrent requests can both pass a pre-check; a database unique constraint remains authoritative.

## What it can do next

- Add relations and foreign keys for profiles, coaches, workouts, and plans.
- Use transactions for workflows spanning multiple tables.
- Add indexes for verified query patterns.
- Use full-text search, JSONB, arrays, generated columns, and row-level security where justified.
- Configure pool size, connection timeout, idle timeout, TLS, and application names for production.
- Add pool error listeners and observability.
- Use read replicas or managed pooling when scale requires them.
- Execute parameterized raw SQL through Prisma for database-specific operations that Prisma Client cannot express cleanly.

## Pooling and lifecycle notes

- A pool prevents each query from opening a brand-new TCP connection.
- Keep one pool per application process. Creating pools per request can exhaust database connections.
- Pool capacity must be planned across all deployed processes. Ten processes with a maximum of ten connections can consume up to one hundred database connections.
- Add graceful shutdown that stops the HTTP server and closes database resources.
- Add an `error` listener where appropriate; unhandled background pool errors can terminate the Node.js process.
- In serverless environments, connection behavior may require a managed pooler or a serverless-specific adapter.

## Data notes

- PostgreSQL unique constraints automatically create unique indexes.
- `timestamptz` stores an instant internally and renders it in the session timezone; it does not retain the original named timezone.
- UUIDs are useful distributed identifiers, but random UUID indexing and storage characteristics should still be understood as tables grow.
- Connection URLs contain credentials. Never log or commit them.

## Official references

- [Prisma PostgreSQL connector](https://www.prisma.io/docs/orm/core-concepts/supported-databases/postgresql)
- [Prisma database drivers](https://www.prisma.io/docs/orm/core-concepts/supported-databases/database-drivers)
- [node-postgres connecting](https://node-postgres.com/features/connecting)
- [node-postgres pooling](https://node-postgres.com/features/pooling)
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL date/time types](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [PostgreSQL UUID type](https://www.postgresql.org/docs/current/datatype-uuid.html)
