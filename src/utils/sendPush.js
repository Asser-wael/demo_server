import webpush from "../config/webpush.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

export const sendPushToSubscriptions = async (subs, payload) => {
    if (!subs.length) {
        console.log("sendPush: no subscriptions to send to for this payload:", payload.title);
        return;
    }

    const results = await Promise.allSettled(
        subs.map((sub) =>
            // web-push throws SYNCHRONOUSLY (e.g. missing/invalid VAPID
            // keys, malformed subscription keys) rather than always
            // rejecting a promise. A bare `.map(sub => webpush.sendNotification(...))`
            // lets that throw escape the whole `.map()` call, which crashes
            // this entire batch (and the caller's request, e.g. an admin
            // broadcast) instead of just failing that one subscription.
            // Deferring the call inside `Promise.resolve().then()` turns any
            // synchronous throw into a normal rejection that
            // `Promise.allSettled` can catch per-subscription.
            Promise.resolve().then(() =>
                webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: sub.keys },
                    JSON.stringify(payload)
                )
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
// لكل اليوزرز (مش الأدمن) — يُستخدم من broadcastController للإرسال الفوري
export const sendPushToAllUsers = async (payload) => {
    const subs = await Subscription.find({ role: "user" });
    await sendPushToSubscriptions(subs, payload);
};