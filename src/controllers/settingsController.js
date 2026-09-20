import Settings from "../models/Settings.js";
import { defaultPalettes } from "../constants/defaultPalettes.js";
import errorCatch from "../utils/errorCatch.js";
import uploadImage from "../utils/uploadImage.js";
import cloudinary from "../config/cloudinary.js";

export const getSettings = errorCatch(async (req, res) => {
  const settings = await Settings.getSingleton();
  res.json(settings);
});

export const updateSettings = errorCatch(async (req, res) => {
  const settings = await Settings.getSingleton();
  const { theme, colors, company, social, phone } = req.body;

  if (theme === "light" || theme === "dark") {
    settings.theme = theme;
  }

  if (colors?.light) {
    settings.colors.light = { ...(settings.colors.light?.toObject?.() || {}), ...colors.light };
  }
  if (colors?.dark) {
    settings.colors.dark = { ...(settings.colors.dark?.toObject?.() || {}), ...colors.dark };
  }

  if (company?.name !== undefined) settings.company.name = company.name;
  if (company?.address !== undefined) settings.company.address = company.address;

  if (social) {
    settings.social = { ...(settings.social?.toObject?.() || {}), ...social };
  }

  if (phone !== undefined) settings.phone = phone;

  await settings.save();
  res.json(settings);
});

export const resetSettingsColors = errorCatch(async (req, res) => {
  const { mode } = req.params;

  if (!["light", "dark"].includes(mode)) {
    return res.status(400).json({ message: "Invalid mode" });
  }

  const settings = await Settings.getSingleton();
  settings.colors[mode] = { ...defaultPalettes[mode] };

  await settings.save();
  res.json(settings);
});

// PUT /settings/home-content
// Accepts multipart form data: optional `video` file, optional `image`
// file, optional `isActive` flag. Either file can be uploaded on its own
// — the admin doesn't have to re-upload both just to change one.
export const updateHomeContent = errorCatch(async (req, res) => {
  const settings = await Settings.getSingleton();
  const { isActive } = req.body;

  const videoFile = req.files?.video?.[0];
  const imageFile = req.files?.image?.[0];

  if (videoFile) {
    if (settings.homeContent.video?.id) {
      await cloudinary.uploader.destroy(settings.homeContent.video.id, {
        resource_type: "video",
      });
    }

    const result = await uploadImage(videoFile, "home", "video");

    settings.homeContent.video = {
      url: result.secure_url,
      id: result.public_id,
    };
  }

  if (imageFile) {
    if (settings.homeContent.image?.id) {
      await cloudinary.uploader.destroy(settings.homeContent.image.id);
    }

    const result = await uploadImage(imageFile, "home");

    settings.homeContent.image = {
      url: result.secure_url,
      id: result.public_id,
    };
  }

  if (isActive !== undefined) {
    settings.homeContent.isActive = isActive === "true" || isActive === true;
  }

  await settings.save();
  res.json(settings);
});

// DELETE /settings/home-content/:type   (type: "video" | "image")
export const deleteHomeMedia = errorCatch(async (req, res) => {
  const { type } = req.params;

  if (!["video", "image"].includes(type)) {
    return res.status(400).json({ message: "Invalid media type" });
  }

  const settings = await Settings.getSingleton();
  const media = settings.homeContent[type];

  if (media?.id) {
    await cloudinary.uploader.destroy(
      media.id,
      type === "video" ? { resource_type: "video" } : undefined
    );
  }

  settings.homeContent[type] = { url: "", id: "" };

  // If both are now gone, turn isActive off too so the frontend falls
  // back to its default bundled asset instead of showing nothing.
  if (!settings.homeContent.video?.url && !settings.homeContent.image?.url) {
    settings.homeContent.isActive = false;
  }

  await settings.save();
  res.json(settings);
});
