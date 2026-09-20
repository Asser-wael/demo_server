import express from "express";
import {
  getUser,
  login,
  refresh,
  register,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  googleAuth,
} from "../controllers/authController.js";
import { authLimiter, optionalAuthMiddleware, protect } from "../middlewares/auth.js";
import Subscription from "../models/Subscription.js";
const router = express.Router();

router.post("/register", authLimiter, register);

router.post("/login", authLimiter, login);

router.post("/verify-otp", authLimiter, verifyOtp);

router.post("/resend-otp", authLimiter, resendOtp);

router.post("/forgot-password", authLimiter, forgotPassword);

router.post("/reset-password", authLimiter, resetPassword);

router.post("/google", authLimiter, googleAuth);

router.get("/user", optionalAuthMiddleware, getUser);

router.post("/refresh", refresh);


router.post("/logout", optionalAuthMiddleware, async (req, res) => {
  try {
    if (req.user?.id) {
      // A user can have a subscription per device (phone, desktop, ...).
      // findOneAndDelete only ever removes one arbitrary match — deleteMany
      // is what "log out" should actually mean for push subscriptions.
      await Subscription.deleteMany({
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
