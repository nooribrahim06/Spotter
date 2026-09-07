# csv-parse

## What it is

`csv-parse` is a robust CSV parser for Node.js. It converts CSV text input into arrays or objects and provides multiple APIs (stream, callback, and sync) to handle different scaling needs.

## How Spotter uses it

Spotter uses the synchronous API (`csv-parse/sync`) inside Prisma seed scripts to load large amounts of catalog data (like foods and recipes) into the database.

The seed scripts reside in [`prisma/seed-food.js`](../../../backend/prisma/seed-food.js) and [`prisma/seed-recipes.js`](../../../backend/prisma/seed-recipes.js). They read CSV files from the `prisma/seed-data` directory and parse them before pushing the records into PostgreSQL via Prisma.

## API currently used

| API | Spotter purpose |
| --- | --- |
| `import { parse } from "csv-parse/sync"` | Imports the synchronous parser. |
| `parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true })` | Parses the raw CSV string into an array of objects. `columns: true` maps the first row to object keys. `bom: true` handles hidden byte-order marks in files to prevent corrupted keys (e.g., `id` becoming `ï»¿id`). |

## What it can do next

- **Streaming API**: If the CSV files grow too large to fit in memory, the seed scripts can be refactored to use the streaming API (`import { parse } from 'csv-parse'`) and process rows in batches.
- **Exporting data**: The related package `csv-stringify` can be added if Spotter ever needs to export user data or reports to CSV format.

## Operational notes

- The sync API reads the entire file into memory at once. This is completely fine for seeding databases on startup or in development, but should not be used in HTTP request handlers if users upload large files.
- The `bom: true` option is critical for CSV files exported from Excel or other editors that embed a Byte Order Mark.

## Official references

- [csv-parse Official Documentation](https://csv.js.org/parse/)
