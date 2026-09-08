import { Server } from "socket.io";
import jwt from "jsonwebtoken";

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
    transports: ["polling", "websocket"],
  });

  // Authentication
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      socket.user = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  // Connection
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Online users
    io.emit("onlineUsers", io.engine.clientsCount);

    // Admin
    socket.on("admin", () => {
      if (socket.user?.role === "admin") {
        socket.join("adminroom");
        console.log("Admin joined");
      }
    });

    // User order
    socket.on("userOrder", (orderId) => {
      if (!orderId) return;

      socket.join(`userOrder-${orderId}`);
    });

    // Disconnect
    socket.on("disconnect", () => {
      io.emit("onlineUsers", io.engine.clientsCount);

      console.log("User disconnected:", socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }

  return io;
};

export { initSocket, getIO };