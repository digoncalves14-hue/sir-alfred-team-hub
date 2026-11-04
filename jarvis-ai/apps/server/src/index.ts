import { loadConfig } from "./config";
import { createJarvis } from "./create";

const config = loadConfig();
const { app, scheduler } = await createJarvis(config);

const shutdown = async () => {
  scheduler?.stop();
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
