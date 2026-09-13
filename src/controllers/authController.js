import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import UserModel from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import generateRefreshToken from "../utils/generateRefreshToken.js";



export const register = async (req, res) => {
  try {
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

    await UserModel.create({
      name,
      email: normalizedEmail,
      password,
      isVerified: true,
      role: "user",
    });

    res.status(201).json({ message: "Registered", type: "success" });
  } catch (error) {
    // Two concurrent registrations for the same email can both pass the
    // findOne check above; the unique index on email is what actually
    // prevents the duplicate, and it surfaces here as a duplicate-key error.
    if (error.code === 11000) {
      return res.status(409).json({ message: "User exists!", type: "error" });
    }

    console.log(error);
    res.status(500).json({ message: "Server error", type: "error" }); // ✅ لازم ترجع response
  }
};
export const login = async (req, res) => {
  try {
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

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials", type: "error" });
    }

    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);


    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userSafe = user.toObject();
    delete userSafe.password;

    res.json({
      accessToken,
      user: userSafe,
      message: "Welcome back!",
      type: "success",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error", type: "error" });
  }
};
export const getUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await UserModel.findById(req.user.id).select("-password");
    res.json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};
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
    console.log(error.name);
    res.status(403).json({ message: "Invalid or expired refresh token" });
  }
};
