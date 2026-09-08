import Category from "../models/Category.js";
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";
import redis from "../config/redis.js";

const CATEGORIES_CACHE_KEY = "categories:all";
const CATEGORY_CACHE_PREFIX = "category:";

// Upload image
const uploadImage = (file) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "Category",
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );

        streamifier
            .createReadStream(file.buffer)
            .pipe(stream);
    });
};


// =========================
// ADD CATEGORY
// =========================

export const addCategory = async (req, res) => {
    try {
        const { name } = req.body;
console.log(req.file,name);

if (!name) {
    return res.status(400).json({
        success: false,
        message: "Category name is required.",
    });
}
console.log(1);

if (!req.file) {
    return res.status(400).json({
        success: false,
        message: "Category image is required.",
    });
}
console.log(1);

const result = await uploadImage(req.file);
console.log(1);

const category = await Category.create({
    name,
    image: result.secure_url,
    imageId: result.public_id,
});

console.log(1);
await redis.del(CATEGORIES_CACHE_KEY);
console.log(1);

        return res.status(201).json({
            success: true,
            message: "Category added successfully.",
            category,
        });

    } catch (error) {
        console.error("Add category error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to add category.",
            error: error.message,
        });
    }
};


// =========================
// DELETE CATEGORY
// =========================

export const deleteCategory = async (req, res) => {
    try {
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
            await cloudinary.uploader.destroy(
                category.imageId
            );
        }

        await Category.findByIdAndDelete(id);

        await redis.del(CATEGORIES_CACHE_KEY);
        await redis.del(
            `${CATEGORY_CACHE_PREFIX}${id}`
        );

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully.",
        });

    } catch (error) {
        console.error("Delete category error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete category.",
            error: error.message,
        });
    }
};


// =========================
// UPDATE CATEGORY
// =========================

export const updateCategory = async (req, res) => {
    try {
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
                await cloudinary.uploader.destroy(
                    category.imageId
                );
            }

            const result = await uploadImage(req.file);

            updatedData.image = result.secure_url;
            updatedData.imageId = result.public_id;
        }

        const updatedCategory =
            await Category.findByIdAndUpdate(
                id,
                updatedData,
                {
                    new: true,
                    runValidators: true,
                }
            );

        await redis.del(CATEGORIES_CACHE_KEY);
        await redis.del(
            `${CATEGORY_CACHE_PREFIX}${id}`
        );

        return res.status(200).json({
            success: true,
            message: "Category updated successfully.",
            category: updatedCategory,
        });

    } catch (error) {
        console.error("Update category error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update category.",
            error: error.message,
        });
    }
};


// =========================
// GET CATEGORIES
// =========================

export const getCategories = async (req, res) => {
    try {
        const cached =
            await redis.get(CATEGORIES_CACHE_KEY);

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

    } catch (error) {
        console.error("Get categories error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get categories.",
            error: error.message,
        });
    }
};


// =========================
// GET ONE CATEGORY
// =========================

export const getCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const cacheKey =
            `${CATEGORY_CACHE_PREFIX}${id}`;

        const cached = await redis.get(cacheKey);

        if (cached) {
            return res.status(200).json({
                success: true,
                category: JSON.parse(cached),
                fromCache: true,
            });
        }

        const category =
            await Category.findById(id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found.",
            });
        }

        await redis.setEx(
            cacheKey,
            600,
            JSON.stringify(category)
        );

        return res.status(200).json({
            success: true,
            category,
            fromCache: false,
        });

    } catch (error) {
        console.error("Get category error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get category.",
            error: error.message,
        });
    }
};
