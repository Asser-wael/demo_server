import redis from "../config/redis.js";
import PopularModel from "../models/popular.js";
import errorCatch from "../utils/errorCatch.js";

const POPULAR_CACHE_KEY = "popular:all";

export const getPopularProducts = errorCatch(async (req, res) => {
    const cached = await redis.get(POPULAR_CACHE_KEY);

    if (cached) {
        return res.status(200).json({
            success: true,
            products: JSON.parse(cached),
        });
    }

    const products = await PopularModel.find().populate("id");

    await redis.set(POPULAR_CACHE_KEY, JSON.stringify(products), "EX", 300);

    return res.status(200).json({
        success: true,
        products,
    });
});

export const addPopularProduct = errorCatch(async (req, res) => {
    const { id } = req.body;

    if (!id) return res.status(400).json({ success: false, message: "Product id is required." });

    const exists = await PopularModel.findOne({ id });

    if (exists) {
        return res.json({
            success: false,
            message: "Product already exists.",
        });
    }

    const popular = await PopularModel.create({ id });

    await redis.del(POPULAR_CACHE_KEY);

    return res.status(201).json({
        success: true,
        message: "Product added to popular successfully.",
        popular,
    });
});

export const deletePopularProduct = errorCatch(async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: "Product id is required." });

    await PopularModel.deleteOne({ id });

    await redis.del(POPULAR_CACHE_KEY);

    return res.status(200).json({
        success: true,
        message: "Product removed from popular successfully.",
    });
});
