import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 3001,
};

// Event isimlerini tanımla
export const EVENTS = {
  JOIN: "room:join",
  CHAT: "chat:message",
  SIGNAL: "signal",  // EKSİK OLAN BU!
  PEER_JOINED: "peer:joined",
  ROOM_PEERS: "room:peers",
  SYSTEM: "system:message"
};