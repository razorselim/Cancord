import { createHttpServer } from "./http/server.js";
import { initSocket } from "../core/socket/socket-server.js";
import { ENV } from "../core/config/env.js";
import { log } from "../core/utils/logger.js";

const httpServer = createHttpServer();
initSocket(httpServer);

httpServer.listen(ENV.PORT, () => {
  log(`SERVER RUNNING ON PORT ${ENV.PORT}`);
});
