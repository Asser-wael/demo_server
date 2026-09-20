import UserModel from "../models/User.js";
import errorCatch from "../utils/errorCatch.js";

export const getProfile = errorCatch(async (req, res) => {
  const user = await UserModel.findById(req.user.id).select("-password");

  if (!user) {
    return res.status(404).json({ message: "User not found", type: "error" });
  }

  res.json(user);
});

export const updateProfile = errorCatch(async (req, res) => {
  const { name, email, avatar } = req.body;

  if (email !== undefined && typeof email !== "string") {
    return res.status(400).json({ message: "Invalid email", type: "error" });
  }

  const user = await UserModel.findById(req.user.id);

  if (!user) {
    return res.status(404).json({ message: "User not found", type: "error" });
  }

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail !== user.email) {
      const emailExists = await UserModel.findOne({ email: normalizedEmail });
      if (emailExists) {
        return res.status(400).json({ message: "Email already in use", type: "error" });
      }
      user.email = normalizedEmail;
    }
  }

  if (name) user.name = name;
  if (avatar) user.avatar = avatar;

  // A duplicate-key race here (two simultaneous updates to the same new
  // email) is caught by the centralized errorHandler, same as register().
  await user.save();

  const userSafe = user.toObject();
  delete userSafe.password;

  res.json({ user: userSafe, message: "Profile updated", type: "success" });
});

export const changePassword = errorCatch(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "Password too short", type: "error" });
  }

  // password has `select: false` in the schema, so it must be explicitly
  // requested here — without this, matchPassword always compares against
  // `undefined` and this endpoint can never succeed.
  const user = await UserModel.findById(req.user.id).select("+password");

  if (!user) {
    return res.status(404).json({ message: "User not found", type: "error" });
  }

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return res.status(401).json({ message: "Current password is incorrect", type: "error" });
  }

  user.password = newPassword; // هيتعمله هاش تلقائي في الـ pre-save hook
  await user.save();

  res.json({ message: "Password changed successfully", type: "success" });
});

export const deleteAccount = errorCatch(async (req, res) => {
  const user = await UserModel.findByIdAndDelete(req.user.id);

  if (!user) {
    return res.status(404).json({ message: "User not found", type: "error" });
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });

  res.json({ message: "Account deleted", type: "success" });
});
