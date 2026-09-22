import express from "express";

import { getUsers } from "../controllers/userController.js";
import { adminMiddleware, protect } from "../middlewares/auth.js";

const router = express.Router();

// ============================================================
// ADMIN
// ============================================================

router.get("/", protect, adminMiddleware, getUsers);

export default router;
