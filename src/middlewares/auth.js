import jwt from "jsonwebtoken";
import User from "../models/User.js";

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