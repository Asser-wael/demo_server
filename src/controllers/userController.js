import User from "../models/User.js";
import errorCatch from "../utils/errorCatch.js";

// ============================================================
// GET /api/users  (admin) — paginated user listing
// ============================================================
export const getUsers = errorCatch(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const search = (req.query.search || "").trim();
    const filter = search
        ? {
              $or: [
                  { name: { $regex: search, $options: "i" } },
                  { email: { $regex: search, $options: "i" } },
              ],
          }
        : {};

    const [users, totalUsers] = await Promise.all([
        User.find(filter)
            .select("name email role isVerified avatar createdAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        User.countDocuments(filter),
    ]);

    return res.json({
        success: true,
        users,
        pagination: {
            page,
            limit,
            totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
        },
    });
});
