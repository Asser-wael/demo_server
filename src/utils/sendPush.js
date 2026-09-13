import webpush from "../config/webpush.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

const sendPushToSubscriptions = async (subs, payload) => {
    if (!subs.length) {
        console.log("sendPush: no subscriptions to send to for this payload:", payload.title);
        return;
    }

    const results = await Promise.allSettled(
        subs.map((sub) =>
            webpush.sendNotification(
                { endpoint: sub.endpoint, keys: sub.keys },
                JSON.stringify(payload)
            )
        )
    );

    results.forEach((r, i) => {
        if (r.status === "rejected") {
            const statusCode = r.reason?.statusCode;

            if ([404, 410].includes(statusCode)) {
                // Subscription is gone on the push service's end (user
                // uninstalled / cleared site data / unsubscribed) — clean it up.
                Subscription.deleteOne({ _id: subs[i]._id }).exec();
            } else {
                // Anything else (401/403 = bad VAPID keys, 400 = malformed
                // payload, 413 = payload too large, network errors, ...) was
                // previously swallowed entirely, with no way to ever find out
                // push was failing. Log it so it's actually diagnosable.
                console.error(
                    `sendPush failed for subscription ${subs[i]._id} (endpoint: ${subs[i].endpoint.slice(0, 60)}...):`,
                    "statusCode:", statusCode,
                    "body:", r.reason?.body || r.reason?.message
                );
            }
        }
    });
};

// لكل الأدمنز
// Look up who is currently an admin instead of trusting the `role` snapshot
// stored on the subscription at subscribe-time — otherwise a user who is
// demoted from admin keeps receiving admin push notifications until they
// happen to resubscribe.
export const sendPushToAdmins = async (payload) => {
    const admins = await User.find({ role: "admin" }).select("_id");
    const adminIds = admins.map((admin) => admin._id);

    const subs = await Subscription.find({ user: { $in: adminIds } });
    await sendPushToSubscriptions(subs, payload);
};

// ليوزر معين (كل أجهزته)
export const sendPushToUser = async (userId, payload) => {
    const subs = await Subscription.find({ user: userId });
    await sendPushToSubscriptions(subs, payload);
};