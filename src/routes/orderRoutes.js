import express from "express";

import {
  checkout,
  changeStatus,
  deleteOrder,
  getOrder,
  getOrders,
  getOrdersUser,
  getOrdersByUser,
} from "../controllers/orderController.js";

import {
  adminMiddleware,
  protect,
} from "../middlewares/auth.js";

import { upload } from "../utils/multer.js";

const router = express.Router();

// ============================================================
// USER
// ============================================================

// Create order
router.post(
  "/checkout",
  protect,
  upload.single("image"),
  checkout
);

// Get current user's orders
router.get(
  "/my-orders",
  protect,
  getOrdersUser
);

// ============================================================
// ADMIN
// ============================================================

// Get all orders
router.get(
  "/orders",
  protect,
  adminMiddleware,
  getOrders
);

// Get one order
router.get(
  "/orders/:id",
  protect,
  adminMiddleware,
  getOrder
);

// Get orders by user
router.get(
  "/user/:id",
  protect,
  adminMiddleware,
  getOrdersByUser
);

// Change order status
router.put(
  "/change-status/:id",
  protect,
  adminMiddleware,
  changeStatus
);

// Delete order
router.delete(
  "/:id",
  protect,
  adminMiddleware,
  deleteOrder
);

export default router;