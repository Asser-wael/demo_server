import mongoose from "mongoose";

const broadcastSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 100 },
        message: { type: String, required: true, trim: true, maxlength: 300 },

        mode: {
            type: String,
            enum: ["now", "scheduled"],
            required: true,
        },

        // "HH:mm" (24h), only set when mode === "scheduled". Each
        // subscriber receives the broadcast when it becomes this time in
        // *their own* local timezone (resolved from the IP captured at
        // subscribe time), not all at once.
        scheduledTime: { type: String },

        status: {
            type: String,
            enum: ["pending", "completed"],
            default: "pending",
        },

        // Subscriptions already delivered to, so the scheduler job never
        // double-sends across its repeated passes.
        deliveredTo: [
            { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
        ],

        targetCount: { type: Number, default: 0 },
        sentCount: { type: Number, default: 0 },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

export default mongoose.model("Broadcast", broadcastSchema);
