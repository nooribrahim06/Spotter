// Single shared Prisma client instance.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { env } from "../config/env.js";

const isVercel = process.env.VERCEL === "1";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Every Vercel instance owns a separate pool. A single connection per
  // instance prevents autoscaling from exhausting a small PostgreSQL service.
  max: isVercel ? 1 : 10,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

// Release idle clients before a Fluid Compute instance is suspended.
if (isVercel) attachDatabasePool(pool);

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
