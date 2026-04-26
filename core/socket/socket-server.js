// socket-server.js - KESİN ÇÖZÜM
import { Server } from "socket.io";
import { EVENTS } from "./events.js";
import { joinRoom, leaveRoom, getRoomUsers } from "../rooms/room-manager.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;

async function initDB() {
  db = await open({
    filename: path.join(__dirname, "../../chat.db"),
    driver: sqlite3.Database
  });
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

initDB();

export function initSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    socket.on(EVENTS.JOIN, async ({ roomId, username }) => {
      socket.data.username = username;
      socket.data.roomId = roomId;

      socket.join(roomId);
      joinRoom(roomId, socket.id, username);

      socket.emit(EVENTS.ROOM_PEERS, getRoomUsers(roomId));
      socket.to(roomId).emit(EVENTS.PEER_JOINED, { username, socketId: socket.id });
      socket.to(roomId).emit(EVENTS.SYSTEM, { text: `${username} connected` });

      console.log(`📥 KATILDI | ${username} | IP: ${clientIp}`);

      if (db) {
        try {
          const oldMessages = await db.all(
            "SELECT username, message, timestamp FROM messages WHERE room_id = ? ORDER BY timestamp ASC LIMIT 50",
            [roomId]
          );
          
          oldMessages.forEach(msg => {
            socket.emit(EVENTS.CHAT, { from: msg.username, message: msg.message, isHistory: true });
          });
          
        } catch (error) {}
      }
    });

    socket.on(EVENTS.CHAT, async ({ roomId, message }) => {
      const username = socket.data.username;
      
      socket.to(roomId).emit(EVENTS.CHAT, { from: username, message });
      console.log(`💬 ${username}: ${message}`);
      
      if (db) {
        try {
          await db.run(
            "INSERT INTO messages (room_id, username, message) VALUES (?, ?, ?)",
            [roomId, username, message]
          );
        } catch (error) {}
      }
    });

    socket.on(EVENTS.SIGNAL, ({ roomId, to, data }) => {
      if (to) {
        socket.to(to).emit(EVENTS.SIGNAL, { from: socket.id, data });
      } else {
        socket.to(roomId).emit(EVENTS.SIGNAL, { from: socket.id, data });
      }
    });

    // EKRAN PAYLAŞIMI DURDURULDU - TÜM ODAYA GÖNDER
    socket.on("screen_share_stopped", ({ roomId }) => {
      console.log("🔥 SERVER: screen_share_stopped, odaya yayılıyor:", roomId);
      io.to(roomId).emit("screen_share_stopped");
    });

    socket.on("disconnect", () => {
      const username = socket.data.username;
      const roomId = socket.data.roomId;

      if (username && roomId) {
        socket.to(roomId).emit(EVENTS.SYSTEM, { text: `${username} disconnected` });
        socket.to(roomId).emit("peer:left", { username });
      }

      if (roomId) {
        leaveRoom(roomId, socket.id);
      }
      
      console.log(`📤 AYRILDI | ${username || 'anonymous'} | IP: ${clientIp}`);
    });
  });

  return io;
}