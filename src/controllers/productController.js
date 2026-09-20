import cloudinary from "../config/cloudinary.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import redis from "../config/redis.js";
import { clearProductCache as clearCache } from "../utils/cache.js";
import uploadImage from "../utils/uploadImage.js";
import errorCatch from "../utils/errorCatch.js";


const PRODUCTS_KEY = "products:all";
const LATEST_KEY = "products:latest";

// The token only carries { id }, never role, so admin status always needs a
// DB lookup — this is intentionally the same pattern adminMiddleware uses.
const isAdminRequest = async (req) => {
  const userId = req.user?.id;
  if (!userId) return false;
  const user = await User.findById(userId).select("role");
  return user?.role === "admin";
};

// costPrice is internal margin data — it must never reach a public/customer
// response, only the admin product-management views.
const stripCostPrice = (product) => {
  const obj = typeof product.toObject === "function" ? product.toObject() : product;
  return {
    ...obj,
    variants: (obj.variants || []).map((variant) => ({
      ...variant,
      sizes: (variant.sizes || []).map(({ costPrice, ...rest }) => rest),
    })),
  };
};

// Add product
export const addProduct = errorCatch(async (req, res) => {
  const { name, description, category, variants, isActive } = req.body;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Product image is required.",
    });
  }

  const image = await uploadImage(req.file);

  const product = await Product.create({
    name,
    description,
    category,
    image: image.secure_url,
    imageId: image.public_id,
    variants:
      typeof variants === "string"
        ? JSON.parse(variants)
        : variants,
    isActive,
  });

  await clearCache();

  return res.status(201).json({
    success: true,
    message: "Product added successfully.",
    product,
  });
});

// Update product
export const updateProduct = errorCatch(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found.",
    });
  }

  const data = {
    ...req.body,
  };

  if (data.variants && typeof data.variants === "string") {
    data.variants = JSON.parse(data.variants);
  }

  if (req.file) {
    const image = await uploadImage(req.file);

    if (product.imageId) {
      await cloudinary.uploader.destroy(product.imageId);
    }

    data.image = image.secure_url;
    data.imageId = image.public_id;
  }

  const updatedProduct = await Product.findByIdAndUpdate(
    id,
    data,
    {
      new: true,
      runValidators: true,
    }
  );

  await clearCache(id);

  return res.status(200).json({
    success: true,
    message: "Product updated successfully.",
    product: updatedProduct,
  });
});

// Delete product
export const deleteProduct = errorCatch(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found.",
    });
  }

  if (product.imageId) {
    await cloudinary.uploader.destroy(product.imageId);
  }

  await Product.findByIdAndDelete(id);

  await clearCache(id);

  return res.status(200).json({
    success: true,
    message: "Product deleted successfully.",
  });
});

// Get all products
// Shared by the public store (isActive-only, no costPrice) and the admin
// product-management page (everything, unfiltered) — the admin panel
// fetches this exact endpoint to list/manage all products, including
// inactive ones, so the split has to happen here rather than by adding a
// separate route.
export const getProducts = errorCatch(async (req, res) => {
  const admin = await isAdminRequest(req);

  if (admin) {
    const products = await Product.find().populate("category", "name");

    return res.status(200).json({
      success: true,
      products,
      fromCache: false,
    });
  }

  const cached = await redis.get(PRODUCTS_KEY);

  if (cached) {
    return res.status(200).json({
      success: true,
      products: JSON.parse(cached),
      fromCache: true,
    });
  }

  const products = await Product.find({ isActive: true })
    .populate("category", "name");

  const publicProducts = products.map(stripCostPrice);

  await redis.setEx(
    PRODUCTS_KEY,
    300,
    JSON.stringify(publicProducts)
  );

  return res.status(200).json({
    success: true,
    products: publicProducts,
    fromCache: false,
  });
});

// Get latest products
export const getLatestProducts = errorCatch(async (req, res) => {
  const cached = await redis.get(LATEST_KEY);

  if (cached) {
    const products = JSON.parse(cached);

    return res.status(200).json({
      success: true,
      count: products.length,
      products,
      fromCache: true,
    });
  }

  const products = await Product.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("category", "name");

  const publicProducts = products.map(stripCostPrice);

  await redis.setEx(
    LATEST_KEY,
    300,
    JSON.stringify(publicProducts)
  );

  return res.status(200).json({
    success: true,
    count: publicProducts.length,
    products: publicProducts,
    fromCache: false,
  });
});

// Get one product
export const getProduct = errorCatch(async (req, res) => {
  const { id } = req.params;

  const cacheKey = `product:${id}`;

  const cached = await redis.get(cacheKey);

  if (cached) {
    return res.status(200).json({
      success: true,
      product: JSON.parse(cached),
      fromCache: true,
    });
  }

  const product = await Product.findById(id)
    .populate("category", "name");

  if (!product || !product.isActive) {
    return res.status(404).json({
      success: false,
      message: "Product not found.",
    });
  }

  const publicProduct = stripCostPrice(product);

  await redis.setEx(
    cacheKey,
    300,
    JSON.stringify(publicProduct)
  );

  return res.status(200).json({
    success: true,
    product: publicProduct,
    fromCache: false,
  });
});
