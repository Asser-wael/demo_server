import express from "express";

import { getSettings, updateSettings } from "../controllers/settingsController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { isAdmin } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.get("/", getSettings);
router.put("/", protect, isAdmin, updateSettings);

export default router;