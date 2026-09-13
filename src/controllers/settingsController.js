import Settings from "../models/Settings.js";
import { defaultPalettes } from "../constants/defaultPalettes.js";

export const getSettings = async (req, res, next) => {
  try {
    const settings = await Settings.getSingleton();
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

export const updateSettings = async (req, res, next) => {
  try {
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

    if (social) {
      settings.social = { ...(settings.social?.toObject?.() || {}), ...social };
    }

    if (phone !== undefined) settings.phone = phone;

    await settings.save();
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

export const resetSettingsColors = async (req, res, next) => {
  try {
    const { mode } = req.params;

    if (!["light", "dark"].includes(mode)) {
      return res.status(400).json({ message: "Invalid mode" });
    }

    const settings = await Settings.getSingleton();
    settings.colors[mode] = { ...defaultPalettes[mode] };

    await settings.save();
    res.json(settings);
  } catch (err) {
    next(err);
  }
};