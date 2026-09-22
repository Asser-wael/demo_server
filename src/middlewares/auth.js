import jwt from "jsonwebtoken";
import User from "../models/User.js";
import rateLimit from "express-rate-limit";


export const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token)
      return res.status(401).json({
        message: "No token provided",
        code: "NO_TOKEN",
      });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = { id: decoded.id };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError")
      return res.status(401).json({
        message: "Access token expired",
        code: "TOKEN_EXPIRED",
      });

    return res.status(401).json({
      message: "Invalid token",
      code: "INVALID_TOKEN",
    });
  }
};

export const adminMiddleware = async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.id);

    if (!user || user.role !== "admin")
      return res.status(403).json({
        message: "No admin access",
      });

    next();
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

export const optionalAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError")
      return res.status(401).json({
        code: "TOKEN_EXPIRED",
        message: "Token expired",
      });

    req.user = null;
    next();
  }
};

export const socketAuth = (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("NO_TOKEN"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.user = { id: decoded.id };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError")
      return next(new Error("TOKEN_EXPIRED"));

    next(new Error("INVALID_TOKEN"));
  }
};



export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 7,
  message: { message: "Too many attempts, try again later.", type: "error" },
  standardHeaders: true,
  legacyHeaders: false,
});

// For sensitive, already-authenticated account actions (change password,
// delete account) — without this, a valid session token could be used to
// brute-force the current password with no throttling at all.
export const sensitiveActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many attempts, try again later.", type: "error" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Checkout creates real orders and decrements real stock — throttle it
// separately from the general API limiter so it can't be used to spam
// orders or hammer the atomic stock-update path.
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many checkout attempts, please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Review creation — cheap to abuse (spam/fake reviews) if left unthrottled.
export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many reviews submitted, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Push subscription — low abuse potential, but still a write endpoint
// that touches the database on every call.
export const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin-mutating routes (settings, order status/delete, product/category
// CRUD) sit only behind the blanket 300/15min API-wide limiter today — a
// compromised or leaked admin token could otherwise hammer these writes
// (several of which also trigger Cloudinary uploads) at the same rate as
// harmless GETs. Generous enough for real admin usage, tight enough to
// blunt abuse.
export const adminMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { success: false, message: "Too many requests, please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Broadcasting a push notification fans out to every subscribed device —
// by far the most expensive admin write in the app — so it gets its own,
// much tighter limiter rather than sharing adminMutationLimiter's budget.
export const broadcastLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many broadcasts, please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});