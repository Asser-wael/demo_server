import { Server } from "socket.io";
import { adminMiddleware, protect } from "../middlewares/auth";

let io;

const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://lux-client-one.vercel.app",
].filter(Boolean);

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // عدد المستخدمين المتصلين حاليًا
    const onlineUsers = io.engine.clientsCount;

    io.emit("onlineUsers", onlineUsers);

    // =========================
    // ADMIN ROOM
    // =========================
    socket.on("admin",  protect, adminMiddleware ,() => {
      socket.join("adminroom");

      console.log(`${socket.id} joined adminroom`);
    });

    // =========================
    // USER ORDER ROOM
    // =========================
    socket.on("userOrder", protect, (idOrder) => {
      if (!idOrder) return;

      const room = `userOrder-${idOrder}`;

      socket.join(room);

      console.log(`${socket.id} joined room: ${room}`);
    });

    // =========================
    // DISCONNECT
    // =========================
    socket.on("disconnect", (reason) => {
      const activeUsers = io.engine.clientsCount;

      io.emit("onlineUsers", activeUsers);

      console.log(
        `User disconnected: ${socket.id} | Reason: ${reason}`
      );
      console.log("Online users:", activeUsers);
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