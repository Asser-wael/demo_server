import mongoose from "mongoose";
import bcrypt from "bcrypt";

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
    },
    color: String,
    size: String,
    quantity: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
      select: false, // مش هيترجع إلا لو عملت .select("+password")
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    notifications: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UserNotification",
      },
    ],

    cart: [cartItemSchema],

    orders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],

    isVerified: {
      type: Boolean,
      default: false,
    },

    otp: String,

    otpExpires: Date,

    avatar: String,
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("User", userSchema);