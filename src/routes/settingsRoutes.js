import express from "express";
import {
  getSettings,
  updateSettings,
  resetSettingsColors,
  updateHomeContent,
  deleteHomeMedia,
} from "../controllers/settingsController.js";
import { adminMiddleware, adminMutationLimiter, protect } from "../middlewares/auth.js";
import { uploadHomeMedia } from "../utils/multer.js";

const router = express.Router();

router.get("/", getSettings);
router.put("/", protect, adminMiddleware, adminMutationLimiter, updateSettings);
router.put("/reset-colors/:mode", protect, adminMiddleware, adminMutationLimiter, resetSettingsColors);

router.put(
  "/home-content",
  protect,
  adminMiddleware,
  adminMutationLimiter,
  uploadHomeMedia.fields([
    { name: "video", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  updateHomeContent
);

router.delete(
  "/home-content/:type",
  protect,
  adminMiddleware,
  adminMutationLimiter,
  deleteHomeMedia
);

export default router;