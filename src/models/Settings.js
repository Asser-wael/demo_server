import mongoose from "mongoose";

const paletteSchema = new mongoose.Schema(
  {
    bg: String,
    card: String,
    text: String,
    muted: String,
    border: String,
    primary: String,
    primaryHover: String,
    accent: String,
    accentLight: String,
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    theme: {
      type: String,
      enum: ["light", "dark"],
      default: "light",
    },

    colors: {
      light: paletteSchema,
      dark: paletteSchema,
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

// Singleton helper — الموقع محتاج document واحد بس
settingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();

  if (!doc) {
    doc = await this.create({
      colors: {
        light: {
          bg: "#f8f8f6",
          card: "#ffffff",
          text: "#0b0b0b",
          muted: "#6b6b6b",
          border: "#e5e5e5",
          primary: "#5a0000",
          primaryHover: "#760000",
          accent: "#8b1a1a",
          accentLight: "#f3e5e5",
        },
        dark: {
          bg: "#080808",
          card: "#111111",
          text: "#ffffff",
          muted: "#a0a0a0",
          border: "#252525",
          primary: "#8b1a1a",
          primaryHover: "#a52a2a",
          accent: "#b33a3a",
          accentLight: "#2a1111",
        },
      },
    });
  }

  return doc;
};

export default mongoose.model("Settings", settingsSchema);