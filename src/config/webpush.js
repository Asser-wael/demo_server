import "./env.js";
import webpush from "web-push";

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;

// If these are missing or malformed, webpush.setVapidDetails() throws
// synchronously — and since this file is imported (transitively, via
// sendPush.js) by orderController.js, an uncaught throw here would crash
// the entire server on startup, taking down checkout/cart/everything just
// because push notifications aren't configured. Push not working is a
// much smaller problem than the whole API being down, so a missing/bad
// VAPID config only disables push and logs a clear warning instead.
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      "mailto:asser@gmail.com",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
  } catch (error) {
    console.error(
      "Invalid VAPID keys — push notifications are disabled:",
      error.message
    );
  }
} else {
  console.error(
    "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set — push notifications are disabled."
  );
}

export default webpush;