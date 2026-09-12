import express from "express";
import { getUser, login, refresh, register } from "../controllers/authController.js";
import { authLimiter, optionalAuthMiddleware, protect } from "../middlewares/auth.js";
import Subscription from "../models/Subscription.js";
const router = express.Router();

router.post("/register",authLimiter, register);

router.post("/login", authLimiter, login);

router.get("/user", optionalAuthMiddleware, getUser);

router.post("/refresh", refresh);


router.post("/logout", optionalAuthMiddleware, async (req, res) => {
  try {
    if (req.user?.id) {
      await Subscription.findOneAndDelete({
        user: req.user.id,
      });
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });

    res.json({
      success: true,
      message: "Logged out",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;