import multer from "multer";

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Only image uploads (JPEG, PNG, WEBP, GIF) are allowed"));
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

// Separate instance for the Home page hero media (video + image), since
// video files are naturally much larger than product photos and need a
// different set of allowed MIME types. Kept independent from `upload`
// above so this doesn't change limits for any other upload flow.
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const homeMediaFileFilter = (req, file, cb) => {
  if (file.fieldname === "video") {
    if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only MP4, WebM, or MOV videos are allowed"));
    }
  } else if (file.fieldname === "image") {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only image uploads (JPEG, PNG, WEBP, GIF) are allowed"));
    }
  }
  cb(null, true);
};

export const uploadHomeMedia = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // videos need much more headroom than product photos
  fileFilter: homeMediaFileFilter,
});