import resend from "../config/resend.js";

// Send OTP for account verification or password reset
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
    from: "Demo Restaurant <noreply@demo.cmcsweb.online>",
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
        <h2>${heading}</h2>

        <div style="
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 8px;
          margin: 20px 0;
        ">
          ${otp}
        </div>

        <p>
          This code expires in 10 minutes.
        </p>

        <p>
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
};

export default sendOTPEmail;