import Broadcast from "../models/Broadcast.js";
import Subscription from "../models/Subscription.js";
import errorCatch from "../utils/errorCatch.js";
import { sendPushToAllUsers } from "../utils/sendPush.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ============================================================
// POST /api/notifications/broadcast  (admin)
// ============================================================
export const createBroadcast = errorCatch(async (req, res) => {
    const { title, message, mode, scheduledTime } = req.body;

    if (!title?.trim() || !message?.trim()) {
        return res.status(400).json({
            success: false,
            message: "Title and message are required",
        });
    }

    if (!["now", "scheduled"].includes(mode)) {
        return res.status(400).json({
            success: false,
            message: "mode must be 'now' or 'scheduled'",
        });
    }

    if (mode === "scheduled" && !TIME_RE.test(scheduledTime || "")) {
        return res.status(400).json({
            success: false,
            message: "scheduledTime must be in HH:mm (24h) format",
        });
    }

    const targetCount = await Subscription.countDocuments({ role: "user" });

    const broadcast = await Broadcast.create({
        title: title.trim(),
        message: message.trim(),
        mode,
        scheduledTime: mode === "scheduled" ? scheduledTime : undefined,
        createdBy: req.user.id,
        targetCount,
    });

    if (mode === "now") {
        try {
            await sendPushToAllUsers({
                title: broadcast.title,
                body: broadcast.message,
            });
            broadcast.sentCount = targetCount;
        } catch (error) {
            // Per-subscription failures are already caught inside
            // sendPushToSubscriptions — reaching here means something
            // upstream (the DB query, webpush config, etc.) failed
            // entirely. Don't fail the whole request or leave the
            // broadcast stuck "pending" forever; record it and move on.
            console.error("broadcast send failed:", error);
        } finally {
            broadcast.status = "completed";
            await broadcast.save();
        }
    }
    // mode === "scheduled" is picked up by the broadcast scheduler job
    // (src/jobs/broadcastScheduler.js), which delivers to each subscriber
    // when it becomes `scheduledTime` in their own local timezone.

    return res.status(201).json({ success: true, broadcast });
});

// ============================================================
// GET /api/notifications/broadcast  (admin) — recent history
// ============================================================
export const getBroadcasts = errorCatch(async (req, res) => {
    const broadcasts = await Broadcast.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .select("-deliveredTo");

    return res.json({ success: true, broadcasts });
});
