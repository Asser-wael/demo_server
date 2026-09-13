import stripe from "../config/stripe.js";
import Order from "../models/Order.js";
import User from "../models/User.js";

export const createCheckoutSession = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        message: "Order ID is required",
      });
    }

    // `protect` only puts { id } on req.user, so fetch the user record
    // ourselves for the email — trusting req.user.email/_id directly
    // would throw, since neither field is ever set on the token payload.
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user.id
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.paymentMethod !== "stripe") {
      return res.status(400).json({
        message: "This order is not a Stripe order",
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({
        message: "Order is already paid",
      });
    }

    const lineItems = order.items.map((item) => ({
      price_data: {
        currency: "egp",
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      payment_method_types: ["card"],

      line_items: lineItems,

      customer_email: user.email,

      metadata: {
        orderId: order._id.toString(),
        userId: user._id.toString(),
      },

      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${process.env.CLIENT_URL}/payment/cancel?orderId=${order._id}`,
    });

    order.stripeSessionId = session.id;

    await order.save();

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("Stripe Checkout Error:", error);

    return res.status(500).json({
      message: "Failed to create Stripe checkout session",
    });
  }
};