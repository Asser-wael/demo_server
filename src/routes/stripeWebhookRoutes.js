// routes/stripeWebhookRoutes.js
import express from "express";
import { handleStripeWebhook } from "../controllers/stripeWebhookController.js";

const router = express.Router();
router.post("/", handleStripeWebhook);

export default router;