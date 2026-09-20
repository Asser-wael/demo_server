import Category from "../models/Category.js";
import cloudinary from "../config/cloudinary.js";
import redis from "../config/redis.js";
import uploadImage from "../utils/uploadImage.js";
import errorCatch from "../utils/errorCatch.js";

const CATEGORIES_CACHE_KEY = "categories:all";
const CATEGORY_CACHE_PREFIX = "category:";


// =========================
// ADD CATEGORY
// =========================

export const addCategory = errorCatch(async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            message: "Category name is required.",
        });
    }

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "Category image is required.",
        });
    }

    const result = await uploadImage(req.file, "Category");

    const category = await Category.create({
        name,
        image: result.secure_url,
        imageId: result.public_id,
    });

    await redis.del(CATEGORIES_CACHE_KEY);

    return res.status(201).json({
        success: true,
        message: "Category added successfully.",
        category,
    });
});


// =========================
// DELETE CATEGORY
// =========================

export const deleteCategory = errorCatch(async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Category id is required.",
        });
    }

    const category = await Category.findById(id);

    if (!category) {
        return res.status(404).json({
            success: false,
            message: "Category not found.",
        });
    }

    if (category.imageId) {
        await cloudinary.uploader.destroy(category.imageId);
    }

    await Category.findByIdAndDelete(id);

    await redis.del(CATEGORIES_CACHE_KEY);
    await redis.del(`${CATEGORY_CACHE_PREFIX}${id}`);

    return res.status(200).json({
        success: true,
        message: "Category deleted successfully.",
    });
});


// =========================
// UPDATE CATEGORY
// =========================

export const updateCategory = errorCatch(async (req, res) => {
    const { id } = req.params;

    const category = await Category.findById(id);

    if (!category) {
        return res.status(404).json({
            success: false,
            message: "Category not found.",
        });
    }

    const updatedData = {
        ...req.body,
    };

    if (req.file) {
        if (category.imageId) {
            await cloudinary.uploader.destroy(category.imageId);
        }

        const result = await uploadImage(req.file, "Category");

        updatedData.image = result.secure_url;
        updatedData.imageId = result.public_id;
    }

    const updatedCategory = await Category.findByIdAndUpdate(
        id,
        updatedData,
        {
            new: true,
            runValidators: true,
        }
    );

    await redis.del(CATEGORIES_CACHE_KEY);
    await redis.del(`${CATEGORY_CACHE_PREFIX}${id}`);

    return res.status(200).json({
        success: true,
        message: "Category updated successfully.",
        category: updatedCategory,
    });
});


// =========================
// GET CATEGORIES
// =========================

export const getCategories = errorCatch(async (req, res) => {
    const cached = await redis.get(CATEGORIES_CACHE_KEY);

    if (cached) {
        return res.status(200).json({
            success: true,
            categories: JSON.parse(cached),
            fromCache: true,
        });
    }

    const categories = await Category.find();

    await redis.setEx(
        CATEGORIES_CACHE_KEY,
        600,
        JSON.stringify(categories)
    );

    return res.status(200).json({
        success: true,
        categories,
        fromCache: false,
    });
});


// =========================
// GET ONE CATEGORY
// =========================

export const getCategory = errorCatch(async (req, res) => {
    const { id } = req.params;

    const cacheKey = `${CATEGORY_CACHE_PREFIX}${id}`;

    const cached = await redis.get(cacheKey);

    if (cached) {
        return res.status(200).json({
            success: true,
            category: JSON.parse(cached),
            fromCache: true,
        });
    }

    const category = await Category.findById(id);

    if (!category) {
        return res.status(404).json({
            success: false,
            message: "Category not found.",
        });
    }

    await redis.setEx(cacheKey, 600, JSON.stringify(category));

    return res.status(200).json({
        success: true,
        category,
        fromCache: false,
    });
});
