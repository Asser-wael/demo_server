import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Order from "../models/Order.js";

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
    console.log("User connected:", socket.id);
    console.log("User:", socket.user);

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
    // USER ORDER ROOM
    // ==========================================
    socket.on("userOrder", async (idOrder) => {
      try {
        if (!socket.user) return;
        if (!idOrder) return;

        // Verify this order actually belongs to the connected user before
        // subscribing them — otherwise any authenticated user could join
        // `userOrder-<anyId>` for an order that isn't theirs and receive
        // its real-time status updates.
        const order = await Order.findById(idOrder).select("user");

        if (!order || order.user.toString() !== socket.user.id) {
          console.log(`Unauthorized userOrder room attempt: ${socket.id}`);
          return;
        }

        const room = `userOrder-${idOrder}`;
        socket.join(room);

        console.log(`${socket.id} joined room: ${room}`);
      } catch (error) {
        console.error("User order room error:", error.message);
      }
    });

    // ==========================================
    // DISCONNECT
    // ==========================================
    socket.on("disconnect", (reason) => {
      const activeUsers = io.engine.clientsCount;
      io.emit("onlineUsers", activeUsers);

      console.log(`User disconnected: ${socket.id} | Reason: ${reason}`);
      console.log("Online users:", activeUsers);
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