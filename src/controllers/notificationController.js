import Notification from "../models/Notification.js";
import UserNotification from "../models/UserNotification.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";


// ============================================================
// ADMIN NOTIFICATIONS
// ============================================================

// GET /admin/notifications
export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find()
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: notifications,
        });
    } catch (error) {
        console.error("Get admin notifications error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// USER NOTIFICATIONS
// ============================================================

// GET /notifications/user
export const getNotificationUser = async (req, res) => {
    try {
        console.log(1);
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
    } catch (error) {
        console.error("Get user notifications error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// ADMIN - MARK ONE AS READ
// ============================================================

// PUT /admin/notifications/:id/read
export const markAsRead = async (req, res) => {
    try {
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
    } catch (error) {
        console.error("Mark notification as read error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// ADMIN - MARK ALL AS READ
// ============================================================

// PUT /admin/notifications/read-all
export const markAllAsRead = async (req, res) => {
    try {
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
    } catch (error) {
        console.error("Mark all notifications as read error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// ADMIN - DELETE NOTIFICATION
// ============================================================

// DELETE /admin/notifications/:id
export const deleteNotification = async (req, res) => {
    try {
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
    } catch (error) {
        console.error("Delete notification error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// USER - MARK ONE AS READ
// ============================================================

// PUT /notifications/user/:id/read
export const markUserNotificationAsRead = async (req, res) => {
    try {
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
    } catch (error) {
        console.error(
            "Mark user notification as read error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// USER - MARK ALL AS READ
// ============================================================

// PUT /notifications/user/read-all
export const markAllUserNotificationsAsRead = async (req, res) => {
    try {
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
    } catch (error) {
        console.error(
            "Mark all user notifications as read error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// USER - DELETE NOTIFICATION
// ============================================================

// DELETE /notifications/user/:id
export const deleteUserNotification = async (req, res) => {
    try {
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
    } catch (error) {
        console.error(
            "Delete user notification error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// ADMIN PUSH SUBSCRIPTION
// ============================================================

// POST /notifications/subscribe
export const saveSubscription = async (req, res) => {
    try {
        const { subscription } = req.body;
        console.log(req.body);
        
        const user = await User.findById(req.user.id)
        
        if (!subscription?.endpoint || !subscription?.keys) {
            return res.status(400).json({
                success: false,
                message: "Invalid subscription",
            });
        }
        console.log(2);
        
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
        
        console.log(3);
        return res.json({
            success: true,
            message: "Push subscribed successfully",
            type: "success",
        });
    } catch (error) {
        console.error("Subscribe Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
            type: "error",
        });
    }
};