import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createContainer } from "./container.ts";

const config = loadConfig();
const container = await createContainer(config);
const app = createApp(container);

const server = app.listen(config.port, config.host, () => {
  const where = config.dataFile ? config.dataFile : "in-memory (not persisted)";
  console.log(`user-system api listening on http://${config.host}:${config.port}`);
  console.log(`  data: ${where}`);
});

// Expired sessions are already rejected on read; this reclaims the space.
const purge = setInterval(() => {
  void container.sessions.purgeExpired();
}, 60 * 60 * 1000);
purge.unref();

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received, closing…`);
    clearInterval(purge);
    server.close(() => {
      void container.store.commit().then(() => process.exit(0));
    });
    // Don't let a hung keep-alive connection block shutdown forever.
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
