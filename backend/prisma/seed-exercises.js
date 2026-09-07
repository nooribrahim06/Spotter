import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Prisma with the pg adapter
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting exercise seeding...');

  // Read the JSON file
  const dataPath = path.join(__dirname, 'seed-data', 'exercises.json');
  const rawData = fs.readFileSync(dataPath, 'utf8');
  const exercises = JSON.parse(rawData);

  console.log(`Loaded ${exercises.length} exercises from JSON.`);

  let successCount = 0;
  let errorCount = 0;

  for (const ex of exercises) {
    try {
      const existing = await prisma.exercise.findFirst({
        where: { name: ex.name }
      });
      
      if (existing) {
        await prisma.exercise.update({
          where: { id: existing.id },
          data: {
            bodyPart: ex.bodyPart,
            targetMuscle: ex.targetMuscle,
            equipment: ex.equipment,
            gifUrl: ex.gifUrl,
            instructions: ex.instructions,
            source: ex.source
          }
        });
      } else {
        await prisma.exercise.create({
          data: {
            name: ex.name,
            bodyPart: ex.bodyPart,
            targetMuscle: ex.targetMuscle,
            equipment: ex.equipment,
            gifUrl: ex.gifUrl,
            instructions: ex.instructions,
            source: ex.source
          }
        });
      }
      successCount++;
    } catch (innerErr) {
      console.error(`Failed to seed ${ex.name}:`, innerErr.message);
      errorCount++;
    }
    
    if (successCount % 10 === 0 && successCount > 0) {
      console.log(`Processed ${successCount} exercises...`);
    }
  }

  console.log('Seeding finished.');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
