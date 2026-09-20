import mongoose from "mongoose";

const sizeSchema = new mongoose.Schema(
  {
    size: { type: String, required: true }, // "S", "M", "L", "XL"
    stock: { type: Number, required: true, default: 0 },
    price: { type: Number, required: true },
    costPrice: { type: Number, required: true },
    offerPrice: { type: Number }, // موجود = فيه عرض، مش موجود = مفيش
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    variant: {
      name: { type: String, required: true }, // e.g. "Spicy", "Large Portion"
    },
    sizes: [sizeSchema],
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    reviews: [reviewSchema],
    image: { type: String },
    imageId: { type: String },
    variants: [variantSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Covers the two real, established query patterns: the public product
// list/latest-products endpoints (isActive, newest first) and category
// browsing (category + isActive together, since every public listing
// filters both).
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ category: 1, isActive: 1 });

export default mongoose.model("products", productSchema);
