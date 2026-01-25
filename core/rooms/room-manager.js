const rooms = {};

export function joinRoom(roomId, socketId, username) {
  if (!rooms[roomId]) {
    rooms[roomId] = {};
  }

  rooms[roomId][socketId] = {
    socketId,
    username
  };
}

export function leaveRoom(roomId, socketId) {
  if (!rooms[roomId]) return;
  delete rooms[roomId][socketId];
}

export function getRoomUsers(roomId) {
  if (!rooms[roomId]) return [];
  return Object.values(rooms[roomId]).map(u => u.username);
}

export function getUsernameBySocket(roomId, socketId) {
  if (!rooms[roomId]) return null;
  return rooms[roomId][socketId]?.username;
}

// rooms/room-manager.js içine bu fonksiyonu ekle
export function getSocketIdsInRoom(roomId) {
  const room = rooms.get(roomId);
  return room ? Array.from(room.keys()) : [];
}