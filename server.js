import "dotenv/config";
import http from "http";

import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { connectRedis } from "./src/config/redis.js";
import { initSocket } from "./src/sockets/index.js";
import { startBroadcastScheduler } from "./src/jobs/broadcastScheduler.js";

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    console.log("🚀 Starting server...");

    await connectDB();
    console.log("✅ MongoDB ready");

    await connectRedis();
    console.log("✅ Redis ready");

    const server = http.createServer(app);

    initSocket(server);
    console.log("✅ Socket.io ready");

    startBroadcastScheduler();
    console.log("✅ Broadcast scheduler ready");

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🔥 Server running on 0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Server startup error:", error);
    process.exit(1);
  }
};

start();