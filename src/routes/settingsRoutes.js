import express from "express";
import { getSettings, updateSettings, resetSettingsColors } from "../controllers/settingsController.js";
import { adminMiddleware, protect } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", getSettings);
router.put("/", protect, adminMiddleware, updateSettings);
router.put("/reset-colors/:mode", protect, adminMiddleware, resetSettingsColors);

export default router;