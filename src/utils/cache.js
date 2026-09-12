import redis from "../config/redis.js";

export const clearProductCache = async (productId) => {
  try {
    await redis.del("products:all");

    await redis.del("products:latest");

    if (productId) {
      await redis.del(`product:${productId}`);
      await redis.del(`product-details:${productId}`);
    }
  } catch (error) {
    console.error("Redis clear error:", error.message);
  }
};