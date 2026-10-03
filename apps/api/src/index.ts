import { createApp } from "./app";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { startOutboxWorker } from "./workers/outboxWorker";

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "OpsFlow API listening");
});

const stopWorker = startOutboxWorker();

async function shutdown() {
  stopWorker();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
