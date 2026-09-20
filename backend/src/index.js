import { env } from "./config/env.js"; // this will automatically validate the environment variables and throw an error if any are missing or invalid
import { app } from "./app.js";
import { prisma } from "./lib/prisma.js";
// TEMP Vercel: retain worker modules, but do not load/start them in the API.
// import { startQueue } from "./queues/queue.js";
// import { startEmailWorker } from "./workers/email.worker.js";
// import { startPlanWorker } from "./workers/plan.worker.js";
async function startServer() {
  try {
    // 1. Environment was already validated during import
    // 2. Verify database connection
    await prisma.$connect();
    // await startQueue(); // TEMP Vercel: queues disabled
    // await startEmailWorker(); // TEMP Vercel: emails sent in auth requests
    // await startPlanWorker(); // TEMP Vercel: expiration sweeps disabled
    // 3. Start accepting requests
    app.listen(env.PORT, env.HOST, () => {
      console.log(`Server running on http://${env.HOST}:${env.PORT}`);
    });
  } catch (error) {
    console.error("Could not start server:", error.message);
    process.exit(1);
  }
}

// Local npm start still listens; Vercel invokes the exported Express app.
if (process.env.VERCEL !== "1") startServer();
export default app;
