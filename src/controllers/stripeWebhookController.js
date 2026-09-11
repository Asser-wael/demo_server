// controllers/stripeWebhookController.js
import stripe from "../config/stripe.js";
import Order from "../models/Order.js";
import { getIO } from "../sockets/index.js";
import { createNotificationUser, createNotification } from "../utils/createNotification.js";
import { sendPushToUser } from "../utils/sendPush.js";

export const handleStripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body, // لازم يكون raw buffer، مش JSON متحلل
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const orderId = session.metadata?.orderId;

        try {
            const order = await Order.findById(orderId);
            if (!order) return res.status(404).json({ message: "Order not found" });

            if (order.paymentStatus === "paid") {
                return res.status(200).json({ received: true }); // idempotency
            }

            order.paymentStatus = "paid";
            order.stripePaymentIntentId = session.payment_intent;
            order.status = "confirmed";
            await order.save();

            const io = getIO();
            io.to(`userOrder-${order._id}`).emit("orderStatus", {
                orderId: order._id,
                status: "confirmed",
            });

            await sendPushToUser(order.user, {
                title: "✅ Payment Confirmed",
                body: `Your payment for order was received successfully.`,
            });

            await createNotificationUser({
                user: order.user,
                title: "Payment Confirmed",
                message: `Payment for order #${order._id.toString().slice(-6).toUpperCase()} confirmed.`,
                type: "success",
            });

            await createNotification({
                title: "💳 Stripe Payment Received",
                message: `Order #${order._id.toString().slice(-6).toUpperCase()} paid via Stripe.`,
                type: "success",
            });
        } catch (err) {
            console.error("Error handling checkout.session.completed:", err);
            return res.status(500).json({ message: "Internal error" });
        }
    }

    // ممكن كمان تتعامل مع checkout.session.expired لو حبيت تلغي الأوردر بعد مهلة

    return res.status(200).json({ received: true });
};