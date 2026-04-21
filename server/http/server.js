import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite veritabanı bağlantısı
let db;

async function initDB() {
  db = await open({
    filename: path.join(__dirname, "../../chat.db"),
    driver: sqlite3.Database
  });
  
  // Mesajlar tablosunu oluştur
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log("✅ SQLite veritabanı hazır");
}

// Veritabanını başlat
initDB();

export function createHttpServer() {
  const app = express();
  const server = http.createServer(app);
  
  // JSON body parser
  app.use(express.json());
  
  // Statik dosyalar
  const webPath = path.join(__dirname, "../../apps/web");
  app.use(express.static(webPath));
  
  // Ana sayfa
  app.get("/", (_, res) => {
    res.sendFile(path.join(webPath, "index.html"));
  });
  
  // Mesaj geçmişini getir (son 50 mesaj)
  app.get("/api/messages/:roomId", async (req, res) => {
    try {
      const { roomId } = req.params;
      const messages = await db.all(
        "SELECT username, message, timestamp FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT 50",
        [roomId]
      );
      res.json(messages.reverse());
    } catch (error) {
      console.error("Mesaj getirme hatası:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Mesaj kaydet (socket.io'dan da çağrılacak)
  app.post("/api/messages", async (req, res) => {
    try {
      const { roomId, username, message } = req.body;
      const result = await db.run(
        "INSERT INTO messages (room_id, username, message) VALUES (?, ?, ?)",
        [roomId, username, message]
      );
      res.json({ id: result.lastID });
    } catch (error) {
      console.error("Mesaj kaydetme hatası:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  return server;
}