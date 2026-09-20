import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

let io;

const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://demo-client-ashen.vercel.app",
].filter(Boolean);

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  // ==========================================
  // SOCKET AUTHENTICATION
  // ==========================================
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!decoded) {
        return next(new Error("Invalid token"));
      }

      // Only trust the id from the token — role is fetched fresh below,
      // same as the HTTP adminMiddleware does.
      socket.user = { id: decoded.id };

      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);
      next(new Error("Authentication failed"));
    }
  });

  // ==========================================
  // CONNECTION
  // ==========================================
  io.on("connection", (socket) => {
    // Every authenticated socket automatically joins a room scoped to its
    // own user id — no client-side "please join my order's room" step
    // needed, and nothing here trusts an id the client supplies, so there
    // is no room a user could ask to join that isn't already theirs.
    // Re-runs on every reconnect for free, since "connection" fires again
    // each time the client reconnects.
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }

    // ==========================================
    // ONLINE USERS
    // ==========================================
    const onlineUsers = io.engine.clientsCount;
    io.emit("onlineUsers", onlineUsers);

    // ==========================================
    // ADMIN ROOM
    // ==========================================
    socket.on("admin", async () => {
      try {
        if (!socket.user) return;

        const user = await User.findById(socket.user.id);

        if (!user || user.role !== "admin") {
          console.log(`Unauthorized admin room attempt: ${socket.id}`);
          return;
        }

        socket.join("adminroom");
        console.log(`${socket.id} joined adminroom`);
      } catch (error) {
        console.error("Admin room error:", error.message);
      }
    });

    // ==========================================
    // DISCONNECT
    // ==========================================
    socket.on("disconnect", () => {
      const activeUsers = io.engine.clientsCount;
      io.emit("onlineUsers", activeUsers);
    });
  });

  return io;
};

// ==========================================
// GET IO
// ==========================================
const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

export { initSocket, getIO };