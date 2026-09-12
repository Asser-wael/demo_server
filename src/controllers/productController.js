import streamifier from "streamifier";
import cloudinary from "../config/cloudinary.js";
import Product from "../models/Product.js";
import redis from "../config/redis.js";
import { clearProductCache as clearCache } from "../utils/cache.js";


const PRODUCTS_KEY = "products:all";
const LATEST_KEY = "products:latest";

const uploadImage = (file) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "products" },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(file.buffer).pipe(stream);
  });
};

// Add product
export const addProduct = async (req, res) => {
  try {
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
  } catch (error) {
    console.error("addProduct:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add product.",
      error: error.message,
    });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
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
  } catch (error) {
    console.error("updateProduct:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update product.",
      error: error.message,
    });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
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
  } catch (error) {
    console.error("deleteProduct:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete product.",
      error: error.message,
    });
  }
};

// Get all products
export const getProducts = async (req, res) => {
  try {
    console.log(1);
    const cached = await redis.get(PRODUCTS_KEY);

    if (cached) {
      return res.status(200).json({
        success: true,
        products: JSON.parse(cached),
        fromCache: true,
      });
    }

    const products = await Product.find()
      .populate("category", "name");

    await redis.setEx(
      PRODUCTS_KEY,
      300,
      JSON.stringify(products)
    );

    return res.status(200).json({
      success: true,
      products,
      fromCache: false,
    });
  } catch (error) {
    console.error("getProducts:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get products.",
    });
  }
};

// Get latest products
export const getLatestProducts = async (req, res) => {
  try {
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

    const products = await Product.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("category", "name");

    await redis.setEx(
      LATEST_KEY,
      300,
      JSON.stringify(products)
    );

    return res.status(200).json({
      success: true,
      count: products.length,
      products,
      fromCache: false,
    });
  } catch (error) {
    console.error("getLatestProducts:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get latest products.",
    });
  }
};

// Get one product
export const getProduct = async (req, res) => {
  try {
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

    await redis.setEx(
      cacheKey,
      300,
      JSON.stringify(product)
    );

    return res.status(200).json({
      success: true,
      product,
      fromCache: false,
    });
  } catch (error) {
    console.error("getProduct:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get product.",
    });
  }
};