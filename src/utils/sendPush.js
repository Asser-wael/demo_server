import webpush from "../config/webpush.js";
import Subscription from "../models/Subscription.js";

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
export const sendPushToAdmins = async (payload) => {
    const subs = await Subscription.find({ role: "admin" });
    await sendPushToSubscriptions(subs, payload);
};

// ليوزر معين (كل أجهزته)
export const sendPushToUser = async (userId, payload) => {
    const subs = await Subscription.find({ user: userId });
    await sendPushToSubscriptions(subs, payload);
};