import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";

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

import { globalRateLimiter } from "./middlewares/rateLimiter.js";
import { sanitizeInputs } from "./middlewares/sanitize.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app = express();

app.set("trust proxy", 1);

// ==========================================
// Security Headers
// ==========================================

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

// ==========================================
// CORS
// ==========================================

const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://demo-client-ashen.vercel.app",
]
  .filter(Boolean)
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin
      // مثل server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS policy violation: Access denied."));
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

// ==========================================
// Stripe Webhook
// IMPORTANT:
// Must come BEFORE express.json()
// ==========================================

app.use(
  "/api/stripe/webhook",
  express.raw({
    type: "application/json",
  }),
  stripeWebhookRoutes
);

// ==========================================
// Rate Limiting
// ==========================================

app.use(globalRateLimiter);

// ==========================================
// Body Parser
// ==========================================

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

// ==========================================
// Cookies
// ==========================================

app.use(cookieParser());

// ==========================================
// MongoDB Query Sanitization
// ==========================================

app.use(mongoSanitize());


// ==========================================
// Health Check
// ==========================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
  });
});

// ==========================================
// Routes
// ==========================================

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

// ==========================================
// Global Error Handler
// ==========================================

app.use(errorHandler);

export default app;