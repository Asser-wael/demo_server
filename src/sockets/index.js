import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import Order from "../models/Order.js";

let io = null;

const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://demo-client-ashen.vercel.app",
].filter(Boolean);

// =========================================================
// INIT SOCKET
// =========================================================

const initSocket = (server) => {
  if (io) return io;

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // =======================================================
  // AUTH MIDDLEWARE
  // =======================================================

  io.use(async (socket, next) => {
    try {
      const authToken = socket.handshake.auth?.token;

      const headerToken = socket.handshake.headers?.authorization
        ?.replace("Bearer ", "")
        ?.trim();

      const token = authToken || headerToken;

      if (!token) {
        console.log("⛔ Socket auth: no token provided");
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const userId =
        decoded.id || decoded.userId || decoded._id;

      if (!userId) {
        return next(new Error("Invalid token payload"));
      }

      const user = await User.findById(userId).select(
        "_id role"
      );

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = {
        id: user._id.toString(),
        role: user.role,
      };

      next();
    } catch (error) {
      console.error(
        "❌ Socket auth error:",
        error.message
      );
      next(new Error("Authentication failed"));
    }
  });

  // =======================================================
  // CONNECTION
  // =======================================================

  io.on("connection", (socket) => {
    console.log(
      `✅ Socket connected: ${socket.id} | user=${socket.user.id} role=${socket.user.role}`
    );

    // Broadcast online count
    io.emit("onlineUsers", io.engine.clientsCount);

    // Auto-join admin room
    if (socket.user.role === "admin") {
      socket.join("adminroom");
      console.log(`👑 ${socket.id} auto-joined adminroom`);
    }

    // =====================================================
    // ADMIN ROOM (manual, redundant but safe)
    // =====================================================

    socket.on("admin", () => {
      if (socket.user.role !== "admin") {
        console.log(
          `⛔ Unauthorized admin room attempt: ${socket.id}`
        );
        return;
      }
      socket.join("adminroom");
      console.log(`👑 ${socket.id} joined adminroom`);
    });

    // =====================================================
    // USER ORDER ROOM
    // =====================================================

    socket.on("userOrder", async (orderId) => {
      try {
        if (!orderId) return;

        if (socket.user.role === "admin") return;

        const order = await Order.findById(orderId).select(
          "user"
        );

        if (!order) {
          console.log(`⚠️ Order not found: ${orderId}`);
          return;
        }

        if (order.user.toString() !== socket.user.id) {
          console.log(
            `⛔ Unauthorized order room attempt: ${socket.id}`
          );
          return;
        }

        const room = `userOrder-${orderId}`;
        socket.join(room);
        console.log(`📦 ${socket.id} joined ${room}`);
      } catch (error) {
        console.error(
          "❌ userOrder room error:",
          error.message
        );
      }
    });

    // =====================================================
    // DISCONNECT
    // =====================================================

    socket.on("disconnect", (reason) => {
      console.log(
        `❌ Socket disconnected: ${socket.id} | reason=${reason}`
      );
      io.emit("onlineUsers", io.engine.clientsCount);
    });

    socket.on("error", (error) => {
      console.error(
        `❌ Socket error (${socket.id}):`,
        error.message
      );
    });
  });

  return io;
};

// =========================================================
// GET IO
// =========================================================

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

export { initSocket, getIO };