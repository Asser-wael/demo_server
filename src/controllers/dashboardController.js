// dashboardController.js

import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";

// #الأربع كروت اللي فوق (Total Revenue, Profit, Orders, Users, Products)
export const getDashboardCards = async (req, res, next) => {
  try {
    const totalRevenue = await Order.aggregate([
      { $match: { status: { $ne: "cancelled" } } }, // #مش بنحسب الأوردرات الملغية
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);

    const totalProfitResult = await getProfitAggregation({
      status: { $ne: "cancelled" },
    });

    const totalOrders = await Order.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalProducts = await Product.countDocuments();

    res.json({
      totalRevenue: totalRevenue[0]?.total || 0,
      totalProfit: totalProfitResult[0]?.totalProfit || 0,
      totalOrders,
      totalUsers,
      totalProducts,
    });
  } catch (err) {
    next(err);
  }
};

// #دالة مساعدة: بترجع صافي الربح لكل عناصر الأوردرات (اجمالي أو لفترة معينة)
const getProfitAggregation = async (matchStage) => {
  return Order.aggregate([
    { $match: matchStage },
    { $unwind: "$items" },   // ✅ بدل $orderItems
    {
      $lookup: {
        from: "products",
        localField: "items.product",   // ✅ بدل orderItems.product
        foreignField: "_id",
        as: "productInfo",
      },
    },
    { $unwind: "$productInfo" },
    { $unwind: "$productInfo.variants" },
    {
      $match: {
        $expr: { $eq: ["$productInfo.variants.color.name", "$items.color"] }, // ✅
      },
    },
    { $unwind: "$productInfo.variants.sizes" },
    {
      $match: {
        $expr: { $eq: ["$productInfo.variants.sizes.size", "$items.size"] }, // ✅
      },
    },
    {
      $addFields: {
        sellPrice: {
          $cond: [
            {
              $and: [
                { $ifNull: ["$productInfo.variants.sizes.offerPrice", false] },
                { $ne: ["$productInfo.variants.sizes.offerPrice", ""] },
              ],
            },
            "$productInfo.variants.sizes.offerPrice",
            "$productInfo.variants.sizes.price",
          ],
        },
      },
    },
    {
      $addFields: {
        itemProfit: {
          $multiply: [
            "$items.quantity",   // ✅ بدل orderItems.quantity
            { $subtract: ["$sellPrice", "$productInfo.variants.sizes.costPrice"] },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        totalProfit: { $sum: "$itemProfit" },
      },
    },
  ]);
};

// #دالة واحدة بتجيب فيها شارت الإيرادات أو الأوردرات حسب الفترة (يوم/شهر/سنة)
const getGroupFormat = (period) => {
  if (period === "yearly") return "%Y";
  if (period === "weekly") return "%Y-%m-%d"; // #آخر 7 أيام كل يوم لوحده
  return "%Y-%m"; // #monthly (افتراضي)
};

const getDateRange = (period) => {
  const now = new Date();
  if (period === "weekly") {
    now.setDate(now.getDate() - 7);
  } else if (period === "yearly") {
    now.setFullYear(now.getFullYear() - 5); // #آخر 5 سنين
  } else {
    now.setMonth(now.getMonth() - 12); // #آخر 12 شهر
  }
  return now;
};

// #شارت الإيرادات (Revenue Chart)
export const getRevenueChart = async (req, res, next) => {
  try {
    const period = req.query.period || "monthly"; // weekly | monthly | yearly
    const startDate = getDateRange(period);
    const format = getGroupFormat(period);

    const data = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $ne: "cancelled" },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format, date: "$createdAt" } },
          revenue: { $sum: "$totalPrice" },
        },
      },
      { $sort: { _id: 1 } }, // #ترتيب حسب التاريخ
    ]);

    res.json(data);
  } catch (err) {
    next(err);
  }
};

// #شارت الربح (Profit Chart)
export const getProfitChart = async (req, res, next) => {
  try {
    const period = req.query.period || "monthly";
    const startDate = getDateRange(period);
    const format = getGroupFormat(period);

    const data = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $ne: "cancelled" },
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },
      { $unwind: "$productInfo.variants" },
      {
        $match: {
          $expr: { $eq: ["$productInfo.variants.color.name", "$items.color"] },
        },
      },
      { $unwind: "$productInfo.variants.sizes" },
      {
        $match: {
          $expr: { $eq: ["$productInfo.variants.sizes.size", "$items.size"] },
        },
      },
      {
        $addFields: {
          sellPrice: {
            $cond: [
              {
                $and: [
                  { $ifNull: ["$productInfo.variants.sizes.offerPrice", false] },
                  { $ne: ["$productInfo.variants.sizes.offerPrice", ""] },
                ],
              },
              "$productInfo.variants.sizes.offerPrice",
              "$productInfo.variants.sizes.price",
            ],
          },
        },
      },
      {
        $addFields: {
          itemProfit: {
            $multiply: [
              "$items.quantity",
              { $subtract: ["$sellPrice", "$productInfo.variants.sizes.costPrice"] },
            ],
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format, date: "$createdAt" } },
          profit: { $sum: "$itemProfit" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(data);
  } catch (err) {
    next(err);
  }
};

// #شارت عدد الأوردرات (Orders Chart)
export const getOrdersChart = async (req, res, next) => {
  try {
    const period = req.query.period || "monthly";
    const startDate = getDateRange(period);
    const format = getGroupFormat(period);

    const data = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format, date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(data);
  } catch (err) {
    next(err);
  }
};

// #آخر 5 أوردرات لجدول Latest Orders
export const getLatestOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(6)
      .populate("user", "name email");

    res.json(orders);
  } catch (err) {
    next(err);
  }
};

// #المنتجات اللي مخزونها قرب يخلص (Low Stock)
export const getLowStockProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true });

    // #بنفلتر يدوي لأن الستوك جوه variants.sizes مش field مباشر
    const lowStock = [];
    products.forEach((product) => {
      product.variants.forEach((variant) => {
        variant.sizes.forEach((size) => {
          if (size.stock <= 5) {
            lowStock.push({
              productId: product._id,
              name: product.name,
              color: variant.color.name,
              size: size.size,
              stock: size.stock,
              image: product.image,
            });
          }
        });
      });
    });

    res.json(lowStock);
  } catch (err) {
    next(err);
  }
};