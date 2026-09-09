import { Server } from "socket.io";
import User from "../models/User.js";
import { socketAuth } from "../middlewares/auth.js";

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

  // Socket authentication
  io.use(socketAuth);

  io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    io.emit("onlineUsers", io.engine.clientsCount);

    // ADMIN
    const user = await User.findById(socket.user.id);

    if (user?.role === "admin") {
      socket.join("adminroom");
      console.log(`${socket.id} joined adminroom`);
    }

    // USER ORDER
    socket.on("userOrder", (idOrder) => {
      if (!idOrder) return;

      const room = `userOrder-${idOrder}`;

      socket.join(room);

      console.log(`${socket.id} joined ${room}`);
    });

    // DISCONNECT
    socket.on("disconnect", (reason) => {
      const activeUsers = io.engine.clientsCount;

      io.emit("onlineUsers", activeUsers);

      console.log(
        `Disconnected: ${socket.id} | ${reason}`
      );
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};

export { initSocket, getIO };