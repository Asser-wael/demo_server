import resend from "../config/resend.js";

// One small function, two call sites (account verification, password
// reset) — both just need a 6-digit code delivered clearly, so a single
// template with a variable subject/heading avoids duplicating the same
// email-sending boilerplate twice.
const sendOTPEmail = async (to, otp, purpose = "verify") => {
  const subject =
    purpose === "reset"
      ? "Reset your password"
      : "Verify your account";

  const heading =
    purpose === "reset"
      ? "Your password reset code is:"
      : "Your verification code is:";

  await resend.emails.send({
    from: "Store <onboarding@yourdomain.com>",
    to,
    subject,
    html: `<h2>${heading} ${otp}</h2><p>Expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`,
  });
};

export default sendOTPEmail;
