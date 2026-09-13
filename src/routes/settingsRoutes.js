import express from "express";

import { getSettings, updateSettings } from "../controllers/settingsController.js";
import { adminMiddleware, protect } from "../middlewares/auth.js";


const router = express.Router();

router.get("/", getSettings);
router.put("/", protect, adminMiddleware, updateSettings);

export default router;