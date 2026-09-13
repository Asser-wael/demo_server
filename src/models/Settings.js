import mongoose from "mongoose";
import { defaultPalettes } from "../constants/defaultPalettes.js";

const paletteSchema = new mongoose.Schema(
  {
    bg: String, card: String, text: String, muted: String, border: String,
    primary: String, primaryHover: String, accent: String, accentLight: String,
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    theme: { type: String, enum: ["light", "dark"], default: "light" },
    colors: { light: paletteSchema, dark: paletteSchema },
    company: { name: { type: String, default: "company" } },
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

settingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();

  if (!doc) {
    doc = await this.create({
      colors: {
        light: { ...defaultPalettes.light },
        dark: { ...defaultPalettes.dark },
      },
    });
  }

  return doc;
};

export default mongoose.model("Settings", settingsSchema);