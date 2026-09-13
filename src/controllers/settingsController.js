import Settings from "../models/Settings.js";

/* =========================================================
   GET /api/settings
   عام — بيتقرا من أي حد (الموقع نفسه بيستخدمه يبني الثيم)
========================================================= */
export const getSettings = async (req, res, next) => {
  try {
    const settings = await Settings.getSingleton();
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

/* =========================================================
   PUT /api/settings
   Admin only — تحديث جزئي (partial update) لأي مفتاح
========================================================= */
export const updateSettings = async (req, res, next) => {
  try {
    const settings = await Settings.getSingleton();

    const { theme, colors, company, social, phone } = req.body;

    if (theme) settings.theme = theme;

    if (colors?.light) {
      settings.colors.light = { ...settings.colors.light.toObject(), ...colors.light };
    }
    if (colors?.dark) {
      settings.colors.dark = { ...settings.colors.dark.toObject(), ...colors.dark };
    }

    if (company?.name !== undefined) settings.company.name = company.name;

    if (social) {
      settings.social = { ...settings.social.toObject(), ...social };
    }

    if (phone !== undefined) settings.phone = phone;

    await settings.save();

    res.json(settings);
  } catch (err) {
    next(err);
  }
};

/* =========================================================
   PUT /api/settings/reset-colors/:mode
   Admin only — استرجاع ألوان الوضع الافتراضية
========================================================= */
export const resetSettingsColors = async (req, res, next) => {
  try {
    const { mode } = req.params;

    if (!["light", "dark"].includes(mode)) {
      return res.status(400).json({ message: "Invalid mode" });
    }

    // بنمسح الـ doc القديم ونخلي الـ singleton يتبني تاني بالقيم الافتراضية
    // (أبسط حل هنا، أو ممكن تحتفظ بنسخة defaults في constants file وترجعلها بس)
    const settings = await Settings.findOne();
    const fresh = await Settings.getSingleton.call(Settings.constructor, {});

    res.json({ message: "استخدم القيم الافتراضية من الفرونت مؤقتًا، أو ابعتلي defaults object واحطها هنا" });
  } catch (err) {
    next(err);
  }
};