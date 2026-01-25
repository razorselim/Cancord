// socket-server.js - DÜZELTİLMİŞ VERSİYON
import { Server } from "socket.io";
import { EVENTS } from "./events.js";
import { joinRoom, leaveRoom, getRoomUsers } from "../rooms/room-manager.js";
import { log } from "../utils/logger.js";

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    console.log("🔌 CONNECTED:", socket.id);

    socket.on(EVENTS.JOIN, ({ roomId, username }) => {
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

      console.log("👤", username, "joined room", roomId);
    });

    socket.on(EVENTS.CHAT, ({ roomId, message }) => {
      socket.to(roomId).emit(EVENTS.CHAT, {
        from: socket.data.username,
        message
      });
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
        // Belirli bir kullanıcıya
        socket.to(to).emit(EVENTS.SIGNAL, {
          from: socket.id,
          data
        });
        console.log("📤 Forwarded to:", to);
      } else {
        // Tüm odaya (gönderen hariç)
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