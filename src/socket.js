import { Server } from "socket.io";
import { verifyToken } from "@clerk/backend";
import { supabase } from "./config/supabase.js";
import { setIo } from "./lib/realtime.js";

export function initSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_URL } });

  // Only signed-in users with a DB record can connect
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error("No token");

      const result = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      const payload = result?.data ?? result;
      if (!payload?.sub) throw new Error("Invalid token");

      const { data: user } = await supabase
        .from("users")
        .select("id, role")
        .eq("clerk_id", payload.sub)
        .maybeSingle();
      if (!user) throw new Error("User not found");

      socket.data.user = user;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { id, role } = socket.data.user;
    socket.join(`user:${id}`);
    if (role === "driver") socket.join("drivers");
  });

  setIo(io);
  return io;
}