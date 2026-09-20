import cloudinary from "../config/cloudinary.js";
import redis from "../config/redis.js";
import Trust from "../models/Turst.js";
import uploadImage from "../utils/uploadImage.js";
import errorCatch from "../utils/errorCatch.js";

const CACHE_KEY = "trust:all";
const CACHE_TTL = 60 * 60; // ساعة واحدة

// GET /api/trust
export const getTrust = errorCatch(async (req, res) => {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    return res.status(200).json({
      success: true,
      trustItems: JSON.parse(cached),
      fromCache: true,
    });
  }

  const trustItems = await Trust.find().sort({ createdAt: -1 });

  await redis.set(CACHE_KEY, JSON.stringify(trustItems), "EX", CACHE_TTL);

  return res.status(200).json({
    success: true,
    trustItems,
    fromCache: false,
  });
});

// POST /api/trust
export const addTrust = errorCatch(async (req, res) => {
  const { title } = req.body;

  if (!title || !req.file) {
    return res.status(400).json({
      success: false,
      message: "Title and image are required.",
    });
  }

  const result = await uploadImage(req.file, "trust");

  const trust = await Trust.create({
    title,
    image: result.secure_url,
    imageId: result.public_id,
  });

  await redis.del(CACHE_KEY);

  return res.status(201).json({
    success: true,
    message: "Trust item added successfully.",
    trust,
  });
});

// PUT /api/trust/:id
export const updateTrust = errorCatch(async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;

  const trust = await Trust.findById(id);
  if (!trust) {
    return res.status(404).json({
      success: false,
      message: "Trust item not found.",
    });
  }

  if (req.file) {
    if (trust.imageId) {
      await cloudinary.uploader.destroy(trust.imageId);
    }
    const result = await uploadImage(req.file, "trust");
    trust.image = result.secure_url;
    trust.imageId = result.public_id;
  }

  if (title) trust.title = title;

  await trust.save();
  await redis.del(CACHE_KEY);

  return res.status(200).json({
    success: true,
    message: "Trust item updated successfully.",
    trust,
  });
});

// DELETE /api/trust/:id
export const deleteTrust = errorCatch(async (req, res) => {
  const { id } = req.params;

  const trust = await Trust.findById(id);
  if (!trust) {
    return res.status(404).json({
      success: false,
      message: "Trust item not found.",
    });
  }

  if (trust.imageId) {
    await cloudinary.uploader.destroy(trust.imageId);
  }

  await trust.deleteOne();
  await redis.del(CACHE_KEY);

  return res.status(200).json({
    success: true,
    message: "Trust item deleted successfully.",
    id,
  });
});
