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
      methods: ["GET", "POST"],
    },

    // مهم مع Railway
    transports: ["polling", "websocket"],
  });

  // =========================
  // SOCKET AUTHENTICATION
  // =========================
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("Authentication required"));
      }

      // Verify JWT
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      // خزّن بيانات المستخدم داخل socket
      socket.user = decoded;

      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);

      return next(new Error("Invalid or expired token"));
    }
  });

  // =========================
  // CONNECTION
  // =========================
  io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);
    console.log("👤 User:", socket.user);

    // =========================
    // ONLINE USERS
    // =========================
    const onlineUsers = io.engine.clientsCount;

    io.emit("onlineUsers", onlineUsers);

    // =========================
    // ADMIN ROOM
    // =========================
    socket.on("admin", () => {
      if (socket.user?.role !== "admin") {
        console.log(
          `❌ Unauthorized admin room attempt: ${socket.id}`
        );

        return;
      }

      socket.join("adminroom");

      console.log(
        `👑 ${socket.id} joined adminroom`
      );
    });

    // =========================
    // USER ORDER ROOM
    // =========================
    socket.on("userOrder", (idOrder) => {
      if (!idOrder) return;

      const room = `userOrder-${idOrder}`;

      socket.join(room);

      console.log(
        `📦 ${socket.id} joined room: ${room}`
      );
    });

    // =========================
    // DISCONNECT
    // =========================
    socket.on("disconnect", (reason) => {
      const activeUsers = io.engine.clientsCount;

      io.emit("onlineUsers", activeUsers);

      console.log(
        `❌ User disconnected: ${socket.id} | Reason: ${reason}`
      );

      console.log(
        "👥 Online users:",
        activeUsers
      );
    });
  });

  return io;
};

// =========================
// GET IO
// =========================
const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }

  return io;
};

export { initSocket, getIO };