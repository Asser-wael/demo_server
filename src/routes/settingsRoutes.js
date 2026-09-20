import express from "express";
import {
  getSettings,
  updateSettings,
  resetSettingsColors,
  updateHomeContent,
  deleteHomeMedia,
} from "../controllers/settingsController.js";
import { adminMiddleware, protect } from "../middlewares/auth.js";
import { uploadHomeMedia } from "../utils/multer.js";

const router = express.Router();

router.get("/", getSettings);
router.put("/", protect, adminMiddleware, updateSettings);
router.put("/reset-colors/:mode", protect, adminMiddleware, resetSettingsColors);

router.put(
  "/home-content",
  protect,
  adminMiddleware,
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
  deleteHomeMedia
);

export default router;