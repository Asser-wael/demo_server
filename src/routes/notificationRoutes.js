import express from "express";

import {
    getNotifications,
    getNotificationUser,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    saveSubscription,
    removeSubscription,
    markUserNotificationAsRead,
    markAllUserNotificationsAsRead,
    deleteUserNotification,
} from "../controllers/notificationController.js";

import {
    protect,
    adminMiddleware,
    subscribeLimiter,
} from "../middlewares/auth.js";

const router = express.Router();


// ============================================================
// USER
// ============================================================

// Get current user's notifications
router.get(
    "/user",
    protect,
    getNotificationUser
);

// Mark one user notification as read
router.put(
    "/user/:id/read",
    protect,
    markUserNotificationAsRead
);

// Mark all user notifications as read
router.put(
    "/user/read-all",
    protect,
    markAllUserNotificationsAsRead
);

// Delete user notification
router.delete(
    "/user/:id",
    protect,
    deleteUserNotification
);


// ============================================================
// ADMIN
// ============================================================

// Get admin notifications
router.get(
    "/",
    protect,
    adminMiddleware,
    getNotifications
);

// Mark admin notification as read
router.put(
    "/read-all",
    protect,
    adminMiddleware,
    markAllAsRead
);

router.put(
    "/:id/read",
    protect,
    adminMiddleware,
    markAsRead
);

// Delete admin notification
router.delete(
    "/:id",
    protect,
    adminMiddleware,
    deleteNotification
);

// Save push subscription
router.post(
    "/subscribe",
    subscribeLimiter,
    protect,
    saveSubscription
);

// Remove push subscription
router.post(
    "/unsubscribe",
    subscribeLimiter,
    protect,
    removeSubscription
);


export default router;