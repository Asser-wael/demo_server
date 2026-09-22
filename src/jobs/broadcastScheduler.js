import Broadcast from "../models/Broadcast.js";
import Subscription from "../models/Subscription.js";
import { sendPushToSubscriptions } from "../utils/sendPush.js";
import { resolveTimezone, currentLocalTime } from "../utils/resolveTimezone.js";

const CHECK_INTERVAL_MS = 60 * 1000;
const MAX_AGE_MS = 25 * 60 * 60 * 1000; // safety cutoff — stop chasing a broadcast after ~25h

// Runs every minute. For every pending "scheduled" broadcast, delivers to
// each not-yet-delivered subscription the moment it becomes
// `scheduledTime` in *that subscription's own* local timezone (derived
// from the IP captured at subscribe time) — so one admin-set clock time
// (e.g. "17:00") reaches every diner at 5pm wherever they are, not all at
// the server's 5pm.
async function processScheduledBroadcasts() {
    const pending = await Broadcast.find({
        mode: "scheduled",
        status: "pending",
    });

    for (const broadcast of pending) {
        const isExpired =
            Date.now() - broadcast.createdAt.getTime() > MAX_AGE_MS;

        const subs = await Subscription.find({
            role: "user",
            _id: { $nin: broadcast.deliveredTo },
        });

        const due = subs.filter((sub) => {
            if (isExpired) return true; // flush whoever's left before giving up
            const tz = resolveTimezone(sub.ip);
            return currentLocalTime(tz) === broadcast.scheduledTime;
        });

        if (due.length) {
            await sendPushToSubscriptions(due, {
                title: broadcast.title,
                body: broadcast.message,
            });

            broadcast.deliveredTo.push(...due.map((s) => s._id));
            broadcast.sentCount += due.length;
        }

        const remaining = await Subscription.countDocuments({
            role: "user",
            _id: { $nin: broadcast.deliveredTo },
        });

        if (remaining === 0 || isExpired) {
            broadcast.status = "completed";
        }

        await broadcast.save();
    }
}

let intervalHandle = null;

export function startBroadcastScheduler() {
    if (intervalHandle) return;
    intervalHandle = setInterval(() => {
        processScheduledBroadcasts().catch((err) =>
            console.error("broadcastScheduler failed:", err)
        );
    }, CHECK_INTERVAL_MS);
}

export function stopBroadcastScheduler() {
    clearInterval(intervalHandle);
    intervalHandle = null;
}
