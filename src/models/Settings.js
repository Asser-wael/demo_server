import mongoose from "mongoose";
import { defaultPalettes } from "../constants/defaultPalettes.js";

const paletteSchema = new mongoose.Schema(
  {
    bg: { type: String, default: "" },
    card: { type: String, default: "" },
    text: { type: String, default: "" },
    muted: { type: String, default: "" },
    border: { type: String, default: "" },
    primary: { type: String, default: "" },
    primaryHover: { type: String, default: "" },
    accent: { type: String, default: "" },
    accentLight: { type: String, default: "" },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    theme: { type: String, enum: ["light", "dark"], default: "light" },
    colors: {
      light: { type: paletteSchema, default: () => defaultPalettes.light },
      dark: { type: paletteSchema, default: () => defaultPalettes.dark },
    },
    company: {
      name: { type: String, default: "company" },
    },
    social: {
      instagram: { type: String, default: "" },
      tiktok: { type: String, default: "" },
      facebook: { type: String, default: "" },
      whatsapp: { type: String, default: "" },
    },
    phone: { type: String, default: "" },
  },
  { timestamps: true }
);

// الدالة المعدلة باستخدام upsert لضمان إنشاء مستند واحد دائماً
settingsSchema.statics.getSingleton = async function () {
  const doc = await this.findOneAndUpdate(
    {}, // البحث عن أول مستند
    {
      $setOnInsert: {
        theme: "light",
        colors: {
          light: defaultPalettes.light,
          dark: defaultPalettes.dark,
        },
        company: { name: "company" },
      },
    },
    {
      new: true, // إرجاع المستند بعد التعديل/الإنشاء
      upsert: true, // إنشاء المستند إذا لم يكن موجوداً
      setDefaultsOnInsert: true, // تطبيق القيم الافتراضية
    }
  );

  return doc;
};

export default mongoose.model("Settings", settingsSchema);