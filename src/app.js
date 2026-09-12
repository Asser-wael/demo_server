import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import dashboardRoutes from "./routes/dashboardRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import productdetailsRoutes from "./routes/productdetailsRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import popularRoutes from "./routes/popularRoutes.js";
import trustRoutes from "./routes/trustRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import accountRoutes from "./routes/accountRoutes.js";
import stripeRoutes from "./routes/stripeRoutes.js";
import stripeWebhookRoutes from "./routes/stripeWebhookRoutes.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://demo-client-ashen.vercel.app"
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
// app.js — عدّل الترتيب ده

app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookRoutes);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());


app.get("/", (req, res) => {
  res.json({ message: "portfolio" });
});




app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/products", productRoutes);
app.use("/api/products", productdetailsRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/popular", popularRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/trust", trustRoutes);

app.use(errorHandler);

export default app;