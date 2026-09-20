import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "products",
          required: true,
        },

        name: String,
        variant: String,
        size: String,
        price: Number,
        quantity: Number,
        image: String,
        costPrice: Number,
      },
    ],

    // How the customer will receive the order.
    // Required at the controller level (checkout() rejects requests with a
    // missing/invalid orderType) for every new order — but NOT required
    // here at the schema level. changeStatus() calls order.save(), which
    // re-runs full schema validation on every field; if this were
    // `required: true`, updating the status of an order created before
    // this field existed would fail validation and the admin could never
    // touch that order again. The default keeps old documents valid and
    // gives any other code path a safe fallback.
    orderType: {
      type: String,
      enum: ["takeaway", "dine_in", "delivery"],
      default: "delivery",
    },

    // Only used when orderType === "dine_in".
    tableNumber: {
      type: String,
      trim: true,
      default: null,
    },

    // Only fully required when orderType === "delivery" — enforced in the
    // controller since the requirement depends on orderType, not on the
    // schema alone.
    shippingAddress: {
      fullName: String,
      phone: String,
      city: String,
      address: String,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "wallet"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    walletPayment: {
      senderName: String,
      senderPhone: String,
      transactionId: String,
      transferImage: String,
    },

    totalPrice: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Covers the two real, established query patterns: a customer's own
// order history (find by user, newest first) and the admin's paginated
// all-orders list (newest first). Without these, both queries degrade to
// a full collection scan + in-memory sort once orders pile up.
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.model("Order", orderSchema);
