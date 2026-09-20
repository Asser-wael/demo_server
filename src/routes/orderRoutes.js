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
    optionalAuthMiddleware,
    checkoutLimiter,
} from "../middlewares/auth.js";

import { upload } from "../utils/multer.js";

const router = express.Router();


// ============================================================
// USER
// ============================================================

// Checkout
// `protect` runs before the upload parses the request body, so an
// unauthenticated request is rejected before the server spends any work
// parsing/buffering an uploaded file.
router.post(
    "/checkout",
    checkoutLimiter,
    protect,
    upload.single("image"),
    checkout
);

// Get current user's orders + notifications
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

// Get specific order
router.get(
    "/orders/:id",
    protect,
    adminMiddleware,
    getOrder
);



// Change order status
router.put(
    "/changeStatus/:id",
    protect,
    adminMiddleware,
    changeStatus
);

// Delete order
router.delete(
    "/deleteOrder/:id",
    protect,
    adminMiddleware,
    deleteOrder
);


export default router;