import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

// Uploads a multer memory-storage file (an object with a `.buffer`) to
// Cloudinary and resolves with the upload result ({ secure_url,
// public_id, ... }). This one function replaces what used to be four
// separate, near-identical copies of the same promise-wrapped stream
// upload spread across productController, categoryController,
// trustController, and orderController.
//
// resourceType defaults to "image" — pass "video" for the home-page hero
// video upload (Cloudinary needs to know up front which kind of media
// it's receiving).
const uploadImage = (file, folder = "products", resourceType = "image") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(file.buffer).pipe(stream);
  });
};

export default uploadImage;
