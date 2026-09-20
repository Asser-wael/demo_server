import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import UserModel from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import generateRefreshToken from "../utils/generateRefreshToken.js";
import generateOTP from "../utils/otp.js";
import sendOTPEmail from "../utils/sendEmail.js";
import errorCatch from "../utils/errorCatch.js";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Shared by login/verifyOtp/resetPassword/googleAuth — every path that
// ends in "the user is now signed in" issues tokens the same way.
const issueSession = (res, user) => {
  const accessToken = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

  const userSafe = user.toObject();
  delete userSafe.password;
  delete userSafe.otp;
  delete userSafe.otpExpires;

  return { accessToken, user: userSafe };
};

export const register = errorCatch(async (req, res) => {
  const { name, email, password } = req.body;

  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ message: "Email is required", type: "error" });
  }

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Name is required", type: "error" });
  }

  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ message: "Password too short", type: "error" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const exist = await UserModel.findOne({ email: normalizedEmail });
  if (exist) {
    return res.status(409).json({ message: "User exists!", type: "error" });
  }

  const otp = generateOTP();

  // Two concurrent registrations for the same email can both pass the
  // findOne check above; the unique index on email is what actually
  // prevents the duplicate. That surfaces as a duplicate-key error, which
  // the centralized errorHandler already turns into a clean 409 message.
  await UserModel.create({
    name,
    email: normalizedEmail,
    password,
    isVerified: false,
    role: "user",
    otp,
    otpExpires: new Date(Date.now() + OTP_TTL_MS),
  });

  await sendOTPEmail(normalizedEmail, otp, "verify");

  res.status(201).json({
    message: "Registered — check your email for a verification code",
    type: "success",
    email: normalizedEmail,
  });
});

// POST /auth/verify-otp — activates the account and logs the user in.
export const verifyOtp = errorCatch(async (req, res) => {
  const { email, otp } = req.body;

  if (typeof email !== "string" || typeof otp !== "string") {
    return res.status(400).json({ message: "Invalid request", type: "error" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (!user || !user.otp || !user.otpExpires) {
    return res.status(400).json({ message: "Invalid or expired code", type: "error" });
  }

  if (user.otpExpires < new Date()) {
    return res.status(400).json({ message: "Code expired, please request a new one", type: "error" });
  }

  if (user.otp !== otp) {
    return res.status(400).json({ message: "Incorrect code", type: "error" });
  }

  user.isVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  const session = issueSession(res, user);

  res.json({ ...session, message: "Account verified", type: "success" });
});

// POST /auth/resend-otp
export const resendOtp = errorCatch(async (req, res) => {
  const { email } = req.body;

  if (typeof email !== "string") {
    return res.status(400).json({ message: "Invalid request", type: "error" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (!user) {
    return res.status(404).json({ message: "No account found for that email", type: "error" });
  }

  if (user.isVerified) {
    return res.status(400).json({ message: "Account is already verified", type: "error" });
  }

  const otp = generateOTP();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
  await user.save();

  await sendOTPEmail(normalizedEmail, otp, "verify");

  res.json({ message: "Verification code resent", type: "success" });
});

export const login = errorCatch(async (req, res) => {
  const { email, password } = req.body;

  // Reject anything that isn't a plain string before it reaches a Mongo
  // query — otherwise a body like { "email": { "$ne": null } } would be
  // passed straight into findOne() as a query operator.
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "Invalid credentials", type: "error" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await UserModel.findOne({ email: normalizedEmail }).select("+password");

  if (!user) {
    return res.status(400).json({ message: "User doesn't exist!", type: "error" });
  }

  if (!user.password) {
    // Registered via Google — there's no local password to check against.
    return res.status(400).json({
      message: "This account uses Google Sign-In. Please continue with Google.",
      type: "error",
    });
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials", type: "error" });
  }

  if (!user.isVerified) {
    return res.status(403).json({
      message: "Please verify your email before logging in",
      type: "error",
      code: "NOT_VERIFIED",
      email: user.email,
    });
  }

  const session = issueSession(res, user);

  res.json({ ...session, message: "Welcome back!", type: "success" });
});

// POST /auth/forgot-password
// Always responds with the same generic message whether or not the email
// is registered — telling the caller "no account with that email" would
// let anyone enumerate which addresses have accounts.
export const forgotPassword = errorCatch(async (req, res) => {
  const { email } = req.body;

  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ message: "Email is required", type: "error" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (user && user.password) {
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
    await user.save();

    await sendOTPEmail(normalizedEmail, otp, "reset");
  }
  // If no user (or a Google-only account with no password to reset),
  // silently do nothing — the response below is identical either way.

  res.json({
    message: "If an account exists for that email, a reset code has been sent.",
    type: "success",
  });
});

// POST /auth/reset-password
export const resetPassword = errorCatch(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (typeof email !== "string" || typeof otp !== "string") {
    return res.status(400).json({ message: "Invalid request", type: "error" });
  }

  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ message: "Password too short", type: "error" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail }).select("+password");

  if (!user || !user.otp || !user.otpExpires) {
    return res.status(400).json({ message: "Invalid or expired code", type: "error" });
  }

  if (user.otpExpires < new Date()) {
    return res.status(400).json({ message: "Code expired, please request a new one", type: "error" });
  }

  if (user.otp !== otp) {
    return res.status(400).json({ message: "Incorrect code", type: "error" });
  }

  user.password = newPassword; // hashed automatically by the pre-save hook
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  res.json({ message: "Password reset successfully — please log in", type: "success" });
});

// POST /auth/google — body: { credential } (Google Identity Services ID token)
export const googleAuth = errorCatch(async (req, res) => {
  const { credential } = req.body;

  if (typeof credential !== "string" || !credential) {
    return res.status(400).json({ message: "Invalid Google credential", type: "error" });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    return res.status(401).json({ message: "Invalid Google sign-in", type: "error" });
  }

  // Only ever trust an email Google itself has verified.
  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ message: "Google account email is not verified", type: "error" });
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  let user = await UserModel.findOne({ email: normalizedEmail });

  if (user) {
    // Link this Google account to an existing (password-based) account on
    // first Google sign-in, rather than creating a duplicate user.
    if (!user.googleId) {
      user.googleId = payload.sub;
      user.isVerified = true;
      await user.save();
    }
  } else {
    user = await UserModel.create({
      name: payload.name || normalizedEmail.split("@")[0],
      email: normalizedEmail,
      googleId: payload.sub,
      isVerified: true,
      role: "user",
    });
  }

  const session = issueSession(res, user);

  res.json({ ...session, message: "Welcome!", type: "success" });
});

export const getUser = errorCatch(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await UserModel.findById(req.user.id).select("-password");
  res.json(user);
});

export const refresh = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return res.status(401).json({
        message: "No refresh token",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_REFRESH
    );

    const user = await UserModel.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    const accessToken = generateToken(user._id);

    res.json({
      accessToken,
    });

  } catch (error) {
    // Deliberately not using errorCatch here: every failure mode (bad
    // signature, expired token, DB lookup failure, anything) is mapped to
    // the same generic 403 on purpose, so nothing about *why* the refresh
    // failed leaks to the client.
    res.status(403).json({ message: "Invalid or expired refresh token" });
  }
};
