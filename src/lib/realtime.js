let io = null;

export function setIo(instance) {
  io = instance;
}

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToDrivers(event, payload) {
  io?.to("drivers").emit(event, payload);
}