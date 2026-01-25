import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createHttpServer() {
  const app = express();
  const server = http.createServer(app);

  const webPath = path.join(__dirname, "../../apps/web");

  app.use(express.static(webPath));

  app.get("/", (_, res) => {
    res.sendFile(path.join(webPath, "index.html"));
  });

  return server;
}
