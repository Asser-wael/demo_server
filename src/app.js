
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

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
import settingsRoutes from "./routes/settingsRoutes.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app = express();

app.set("trust proxy", 1);

// Security headers
app.use(helmet());

const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://demo-client-ashen.vercel.app",
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Stripe webhook MUST receive the raw body
// before express.json()
app.use(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

// Request body limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use(cookieParser());


// Baseline API rate limit
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/", (req, res) => {
  res.json({ message: "portfolio" });
});

// Routes
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
app.use("/api/settings", settingsRoutes);

// Error handler MUST be last
app.use(errorHandler);

export default app;