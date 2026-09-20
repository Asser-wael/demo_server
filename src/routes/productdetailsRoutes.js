import express from "express";

import {
  getProductDetails,
  addProductReview,
} from "../controllers/productdetailsController.js";

import { protect, reviewLimiter } from "../middlewares/auth.js";

const router = express.Router();

// Product details
router.get(
  "/productDetails/:id",
  getProductDetails
);

// Add / update review
router.post(
  "/product/:id/reviews",
  reviewLimiter,
  protect,
  addProductReview
);

export default router;