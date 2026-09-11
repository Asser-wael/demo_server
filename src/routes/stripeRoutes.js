import express from "express";
import { createCheckoutSession } from "../controllers/stripeController.js";
import { protect } from "../middlewares/auth.js";

const router = express.Router();

router.post(
  "/create-checkout-session",
  protect,
  createCheckoutSession
);

export default router;