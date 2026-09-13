import webpush from "../config/webpush.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

const sendPushToSubscriptions = async (subs, payload) => {
    const results = await Promise.allSettled(
        subs.map((sub) =>
            webpush.sendNotification(
                { endpoint: sub.endpoint, keys: sub.keys },
                JSON.stringify(payload)
            )
        )
    );

    results.forEach((r, i) => {
        if (r.status === "rejected" && [404, 410].includes(r.reason?.statusCode)) {
            Subscription.deleteOne({ _id: subs[i]._id }).exec();
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