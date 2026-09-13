import express from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
} from "../controllers/accountController.js";
import { protect, sensitiveActionLimiter } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", protect, getProfile);
router.put("/", protect, updateProfile);
router.put("/password", protect, sensitiveActionLimiter, changePassword);
router.delete("/", protect, sensitiveActionLimiter, deleteAccount);

export default router;