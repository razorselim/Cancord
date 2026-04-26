import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcrypt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;

async function initDB() {
  db = await open({
    filename: path.join(__dirname, "../../chat.db"),
    driver: sqlite3.Database
  });
  
  // Mesajlar tablosu
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Kullanıcılar tablosu
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log("✅ SQLite veritabanı hazır (messages + users)");
}

initDB();

export function createHttpServer() {
  const app = express();
  const server = http.createServer(app);
  
  app.use(express.json());
  
  const webPath = path.join(__dirname, "../../apps/web");
  app.use(express.static(webPath));
  
  app.get("/", (_, res) => {
    res.sendFile(path.join(webPath, "index.html"));
  });
  
  // ========== KAYIT ==========
  app.post("/api/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Kullanıcı adı ve şifre gerekli" });
      }
      if (username.length < 3) {
        return res.status(400).json({ error: "Kullanıcı adı en az 3 karakter" });
      }
      if (password.length < 4) {
        return res.status(400).json({ error: "Şifre en az 4 karakter" });
      }
      
      const hashed = await bcrypt.hash(password, 10);
      await db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashed]);
      res.json({ success: true, message: "Kayıt başarılı" });
    } catch (error) {
      if (error.message.includes("UNIQUE")) {
        res.status(400).json({ error: "Bu kullanıcı adı zaten alınmış" });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  });
  
  // ========== GİRİŞ ==========
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);
      if (!user) {
        return res.status(401).json({ error: "Kullanıcı bulunamadı" });
      }
      
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Şifre hatalı" });
      }
      
      res.json({ success: true, username: user.username });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // ========== MESAJ GEÇMİŞİ ==========
  app.get("/api/messages/:roomId", async (req, res) => {
    try {
      const { roomId } = req.params;
      const messages = await db.all(
        "SELECT username, message, timestamp FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT 50",
        [roomId]
      );
      res.json(messages.reverse());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // ========== MESAJ KAYDET ==========
  app.post("/api/messages", async (req, res) => {
    try {
      const { roomId, username, message } = req.body;
      await db.run(
        "INSERT INTO messages (room_id, username, message) VALUES (?, ?, ?)",
        [roomId, username, message]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  return server;
}