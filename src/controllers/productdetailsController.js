import Product from "../models/Product.js";
import redis from "../config/redis.js";
import User from "../models/User.js";

// costPrice is internal margin data and must never reach this public,
// unauthenticated product-details page.
const stripCostPrice = (product) => ({
  ...product,
  variants: (product.variants || []).map((variant) => ({
    ...variant,
    sizes: (variant.sizes || []).map(({ costPrice, ...rest }) => rest),
  })),
});

const stripCostPriceFromList = (products) => products.map(stripCostPrice);

// Get product details
export const getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const cacheKey = `product-details:${id}`;

    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.status(200).json({
        success: true,
        fromCache: true,
        ...JSON.parse(cached),
      });
    }

    const product = await Product.findById(id)
      .populate("category", "name")
      .populate("reviews.user", "name")
      .lean();

    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const relatedProducts = await Product.find({
      _id: { $ne: product._id },
      category: product.category?._id,
      isActive: true,
    })
      .limit(8)
      .select("name image variants rating numReviews")
      .lean();

    const differentProducts = await Product.aggregate([
      {
        $match: {
          _id: { $ne: product._id },
          category: { $ne: product.category?._id },
          isActive: true,
        },
      },
      {
        $sample: {
          size: 8,
        },
      },
      {
        $project: {
          name: 1,
          image: 1,
          variants: 1,
          rating: 1,
          numReviews: 1,
        },
      },
    ]);

    const result = {
      product: stripCostPrice(product),
      relatedProducts: stripCostPriceFromList(relatedProducts),
      differentProducts: stripCostPriceFromList(differentProducts),
    };

    await redis.setEx(
      cacheKey,
      300,
      JSON.stringify(result)
    );

    return res.status(200).json({
      success: true,
      fromCache: false,
      ...result,
    });
  } catch (error) {
    console.error("getProductDetails:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch product.",
    });
  }
};

// Add / Update review
export const addProductReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

const numericRating = Number(rating);

if (
  !Number.isFinite(numericRating) ||
  numericRating < 1 ||
  numericRating > 5
) {
  return res.status(400).json({
    success: false,
    message: "Rating must be between 1 and 5.",
  });
}

const cleanComment = comment?.trim();

if (!cleanComment) {
  return res.status(400).json({
    success: false,
    message: "Comment is required.",
  });
}
const userId = req.user?.id;

if (!userId) {
  return res.status(401).json({
    success: false,
    message: "You must be logged in to review.",
  });
}
const currentUser = await User.findById(userId).select("name");

if (!currentUser) {
  return res.status(404).json({ success: false, message: "User not found." });
}
const product = await Product.findById(id);

if (!product || !product.isActive) {
  return res.status(404).json({
    success: false,
    message: "Product not found.",
  });
}

const existingReview = product.reviews.find(
  (review) =>
    review.user?.toString() === userId.toString()
);

if (existingReview) {
  existingReview.rating = numericRating;
  existingReview.comment = cleanComment;
  existingReview.updatedAt = new Date();
} else {
  product.reviews.push({
    user: userId,
    name: currentUser.name,
    rating: numericRating,
    comment: cleanComment,
  });
}

product.numReviews = product.reviews.length;

const totalRating = product.reviews.reduce(
  (total, review) =>
    total + Number(review.rating || 0),
  0
);

product.rating =
product.numReviews > 0
? Number(
  (totalRating / product.numReviews).toFixed(1)
)
: 0;

await product.save();

// Clear caches
await Promise.all([
  redis.del(`product:${id}`),
      redis.del(`product-details:${id}`),
    ]);

    await product.populate("category", "name");
    await product.populate("reviews.user", "name");

    return res.status(200).json({
      success: true,
      message: existingReview
        ? "Review updated."
        : "Review added.",
      product: stripCostPrice(product.toObject()),
    });
  } catch (error) {
    console.error("addProductReview:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add review.",
    });
  }
};