import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting raw SQL execution...');
  const sqlDir = path.join(__dirname, 'sql');
  const files = ['001_indexes.sql', '002_triggers.sql', '003_views.sql'];

  for (const file of files) {
    const filePath = path.join(sqlDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`Executing ${file}...`);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      
      try {
        // Split by statement if needed, or run as a single block if possible.
        // Prisma's $executeRawUnsafe sometimes struggles with multiple statements.
        // Using the pg pool directly for multiple statements is safer.
        await pool.query(sqlContent);
        console.log(`${file} executed successfully.`);
      } catch (err) {
        console.error(` Error executing ${file}:`, err.message);
      }
    } else {
      console.warn(`File not found: ${file}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
