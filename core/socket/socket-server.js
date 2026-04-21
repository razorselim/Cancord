// socket-server.js - SQLite DESTEKLİ
import { Server } from "socket.io";
import { EVENTS } from "./events.js";
import { joinRoom, leaveRoom, getRoomUsers } from "../rooms/room-manager.js";
import { log } from "../utils/logger.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite veritabanı
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
  
  console.log("✅ SQLite mesaj veritabanı hazır");
}

// Veritabanını başlat
initDB();

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    console.log("🔌 CONNECTED:", socket.id);

    socket.on(EVENTS.JOIN, async ({ roomId, username }) => {
      socket.data.username = username;
      socket.data.roomId = roomId;

      socket.join(roomId);
      joinRoom(roomId, socket.id, username);

      // Mevcut kullanıcıları gönder
      socket.emit(EVENTS.ROOM_PEERS, getRoomUsers(roomId));

      // Diğerlerine yeni geleni bildir
      socket.to(roomId).emit(EVENTS.PEER_JOINED, {
        username,
        socketId: socket.id
      });

      socket.to(roomId).emit(EVENTS.SYSTEM, {
        text: `${username} connected`
      });

      // GEÇMİŞ MESAJLARI GÖNDER (son 50 mesaj)
      if (db) {
        try {
          const oldMessages = await db.all(
            "SELECT username, message, timestamp FROM messages WHERE room_id = ? ORDER BY timestamp ASC LIMIT 50",
            [roomId]
          );
          
          oldMessages.forEach(msg => {
            socket.emit(EVENTS.CHAT, {
              from: msg.username,
              message: msg.message,
              isHistory: true
            });
          });
          
          console.log(`📜 ${oldMessages.length} geçmiş mesaj gönderildi`);
        } catch (error) {
          console.error("Geçmiş mesaj hatası:", error);
        }
      }

      console.log("👤", username, "joined room", roomId);
    });

    socket.on(EVENTS.CHAT, async ({ roomId, message }) => {
      const username = socket.data.username;
      
      // Mesajı herkese gönder
      socket.to(roomId).emit(EVENTS.CHAT, {
        from: username,
        message
      });
      
      // Mesajı VERİTABANINA KAYDET
      if (db) {
        try {
          await db.run(
            "INSERT INTO messages (room_id, username, message) VALUES (?, ?, ?)",
            [roomId, username, message]
          );
          console.log(`💾 Mesaj kaydedildi: ${username}: ${message.substring(0, 30)}`);
        } catch (error) {
          console.error("Mesaj kaydetme hatası:", error);
        }
      }
    });

    // 🎯 TEK VE DOĞRU SIGNAL HANDLER
    socket.on(EVENTS.SIGNAL, ({ roomId, to, data }) => {
      console.log("📨 SIGNAL:", {
        from: socket.data.username || socket.id,
        to: to || "broadcast",
        type: data.type
      });

      if (data.type === "offer") {
        console.log("📄 Offer SDP preview:", 
                    data.offer.sdp ? data.offer.sdp.substring(0, 80) + "..." : "no sdp");
      }

      if (to) {
        socket.to(to).emit(EVENTS.SIGNAL, {
          from: socket.id,
          data
        });
        console.log("📤 Forwarded to:", to);
      } else {
        socket.to(roomId).emit(EVENTS.SIGNAL, {
          from: socket.id,
          data
        });
        console.log("📤 Broadcasted to room:", roomId);
      }
    });

    socket.on("disconnect", () => {
      const username = socket.data.username;
      const roomId = socket.data.roomId;

      if (username && roomId) {
        socket.to(roomId).emit(EVENTS.SYSTEM, {
          text: `${username} disconnected`
        });
        
        socket.to(roomId).emit("peer:left", { username });
      }

      if (roomId) {
        leaveRoom(roomId, socket.id);
      }
      
      console.log("🔌 DISCONNECTED:", socket.id, username || "unknown");
    });
  });

  return io;
}