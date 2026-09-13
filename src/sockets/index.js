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

  // =========================================================
  // SOCKET AUTH
  // =========================================================

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token;

      if (!token) {
        return next(
          new Error("Authentication required")
        );
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      const userId =
        decoded.id ||
        decoded.userId ||
        decoded._id;

      if (!userId) {
        return next(
          new Error("Invalid token")
        );
      }

      const user =
        await User.findById(userId)
          .select("_id role");

      if (!user) {
        return next(
          new Error("User not found")
        );
      }

      socket.user = {
        id: user._id.toString(),
        role: user.role,
      };

      next();
    } catch (error) {
      console.error(
        "Socket authentication error:",
        error.message
      );

      next(
        new Error("Authentication failed")
      );
    }
  });

  // =========================================================
  // CONNECTION
  // =========================================================

  io.on("connection", (socket) => {
    console.log(
      "Socket connected:",
      socket.id
    );

    console.log(
      "User:",
      socket.user
    );

    // =======================================================
    // ONLINE USERS
    // =======================================================

    io.emit(
      "onlineUsers",
      io.engine.clientsCount
    );

    // =======================================================
    // ADMIN ROOM
    // =======================================================

    socket.on("admin", () => {
      if (!socket.user) return;

      if (socket.user.role !== "admin") {
        console.log(
          `Unauthorized admin room attempt: ${socket.id}`
        );

        return;
      }

      socket.join("adminroom");

      console.log(
        `${socket.id} joined adminroom`
      );
    });

    // =======================================================
    // USER ORDER ROOM
    // =======================================================

    socket.on(
      "userOrder",
      async (orderId) => {
        try {
          if (!socket.user) return;

          if (!orderId) return;

          // Only normal users can join order rooms
          if (
            socket.user.role === "admin"
          ) {
            return;
          }

          const order =
            await Order.findById(
              orderId
            ).select("user");

          if (!order) {
            console.log(
              `Order not found: ${orderId}`
            );

            return;
          }

          const orderUserId =
            order.user.toString();

          if (
            orderUserId !==
            socket.user.id
          ) {
            console.log(
              `Unauthorized order room attempt: ${socket.id}`
            );

            return;
          }

          const room =
            `userOrder-${orderId}`;

          socket.join(room);

          console.log(
            `${socket.id} joined ${room}`
          );
        } catch (error) {
          console.error(
            "User order room error:",
            error.message
          );
        }
      }
    );

    // =======================================================
    // DISCONNECT
    // =======================================================

    socket.on(
      "disconnect",
      (reason) => {
        const activeUsers =
          io.engine.clientsCount;

        io.emit(
          "onlineUsers",
          activeUsers
        );

        console.log(
          `Socket disconnected: ${socket.id}`
        );

        console.log(
          `Reason: ${reason}`
        );

        console.log(
          "Online users:",
          activeUsers
        );
      }
    );
  });

  return io;
};

// =========================================================
// GET IO
// =========================================================

const getIO = () => {
  if (!io) {
    throw new Error(
      "Socket.io not initialized"
    );
  }

  return io;
};

export {
  initSocket,
  getIO,
};