import Notification from "../models/Notification.js";
import UserNotification from "../models/UserNotification.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import errorCatch from "../utils/errorCatch.js";


// ============================================================
// ADMIN NOTIFICATIONS
// ============================================================

// GET /admin/notifications
export const getNotifications = errorCatch(async (req, res) => {
    const notifications = await Notification.find()
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        data: notifications,
    });
});


// ============================================================
// USER NOTIFICATIONS
// ============================================================

// GET /notifications/user
export const getNotificationUser = errorCatch(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
    }

    const user = await User.findById(userId)
        .populate({
            path: "notifications",
            options: {
                sort: {
                    createdAt: -1,
                },
            },
        });

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    return res.status(200).json({
        success: true,
        data: user.notifications || [],
    });
});


// ============================================================
// ADMIN - MARK ONE AS READ
// ============================================================

// PUT /admin/notifications/:id/read
export const markAsRead = errorCatch(async (req, res) => {
    const notification = await Notification.findByIdAndUpdate(
        req.params.id,
        {
            read: true,
        },
        {
            new: true,
        }
    );

    if (!notification) {
        return res.status(404).json({
            success: false,
            message: "Notification not found",
        });
    }

    return res.status(200).json({
        success: true,
        data: notification,
    });
});


// ============================================================
// ADMIN - MARK ALL AS READ
// ============================================================

// PUT /admin/notifications/read-all
export const markAllAsRead = errorCatch(async (req, res) => {
    await Notification.updateMany(
        {
            read: false,
        },
        {
            read: true,
        }
    );

    return res.status(200).json({
        success: true,
        message: "All notifications marked as read",
    });
});


// ============================================================
// ADMIN - DELETE NOTIFICATION
// ============================================================

// DELETE /admin/notifications/:id
export const deleteNotification = errorCatch(async (req, res) => {
    const notification = await Notification.findByIdAndDelete(
        req.params.id
    );

    if (!notification) {
        return res.status(404).json({
            success: false,
            message: "Notification not found",
        });
    }

    return res.status(200).json({
        success: true,
        message: "Notification deleted",
    });
});


// ============================================================
// USER - MARK ONE AS READ
// ============================================================

// PUT /notifications/user/:id/read
export const markUserNotificationAsRead = errorCatch(async (req, res) => {
    const userId = req.user?.id;
    const notificationId = req.params.id;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
    }

    const user = await User.findById(userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    // تأكد إن الـ notification تخص المستخدم
    const exists = user.notifications.some(
        (id) => id.toString() === notificationId
    );

    if (!exists) {
        return res.status(404).json({
            success: false,
            message: "Notification not found",
        });
    }

    const notification =
        await UserNotification.findByIdAndUpdate(
            notificationId,
            {
                isRead: true,
            },
            {
                new: true,
            }
        );

    if (!notification) {
        return res.status(404).json({
            success: false,
            message: "Notification not found",
        });
    }

    return res.status(200).json({
        success: true,
        data: notification,
    });
});


// ============================================================
// USER - MARK ALL AS READ
// ============================================================

// PUT /notifications/user/read-all
export const markAllUserNotificationsAsRead = errorCatch(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
    }

    const user = await User.findById(userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    await UserNotification.updateMany(
        {
            _id: {
                $in: user.notifications,
            },
            isRead: false,
        },
        {
            isRead: true,
        }
    );

    return res.status(200).json({
        success: true,
        message: "All user notifications marked as read",
    });
});


// ============================================================
// USER - DELETE NOTIFICATION
// ============================================================

// DELETE /notifications/user/:id
export const deleteUserNotification = errorCatch(async (req, res) => {
    const userId = req.user?.id;
    const notificationId = req.params.id;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
    }

    const user = await User.findById(userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    const exists = user.notifications.some(
        (id) => id.toString() === notificationId
    );

    if (!exists) {
        return res.status(404).json({
            success: false,
            message: "Notification not found",
        });
    }

    // شيل الـ ID من User
    await User.findByIdAndUpdate(
        userId,
        {
            $pull: {
                notifications: notificationId,
            },
        }
    );

    // احذف notification نفسها
    await UserNotification.findByIdAndDelete(
        notificationId
    );

    return res.status(200).json({
        success: true,
        message: "Notification deleted successfully",
    });
});


// ============================================================
// ADMIN PUSH SUBSCRIPTION
// ============================================================

// POST /notifications/subscribe
export const saveSubscription = errorCatch(async (req, res) => {
    const { subscription } = req.body;

    const user = await User.findById(req.user.id)

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    if (!subscription?.endpoint || !subscription?.keys) {
        return res.status(400).json({
            success: false,
            message: "Invalid subscription",
        });
    }

    await Subscription.findOneAndUpdate(
        {
            endpoint: subscription.endpoint,
        },
        {
            user: req.user.id,
            role: user.role == "admin" ? "admin" : "user",
            endpoint: subscription.endpoint,
            keys: subscription.keys,
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }
    );

    return res.json({
        success: true,
        message: "Push subscribed successfully",
        type: "success",
    });
});

// POST /notifications/unsubscribe
// Scoped to the current user — only ever deletes a subscription that
// belongs to them, never an arbitrary endpoint someone might guess.
export const removeSubscription = errorCatch(async (req, res) => {
    const { endpoint } = req.body;

    if (!endpoint) {
        return res.status(400).json({
            success: false,
            message: "Endpoint is required",
        });
    }

    await Subscription.deleteOne({
        endpoint,
        user: req.user.id,
    });

    return res.json({
        success: true,
        message: "Push unsubscribed successfully",
        type: "success",
    });
});