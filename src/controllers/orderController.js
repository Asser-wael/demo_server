import axios from "axios";
import streamifier from "streamifier";

import cloudinary from "../config/cloudinary.js";
import redis from "../config/redis.js";

import User from "../models/User.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";

import { getIO } from "../sockets/index.js";

import {
  createNotification,
  createNotificationUser,
} from "../utils/createNotification.js";

import {
  sendPushToAdmins,
  sendPushToUser,
} from "../utils/sendPush.js";

// ============================================================
// POST /checkout
// ============================================================

export const checkout = async (req, res) => {
  let appliedStockUpdates = [];

  try {
    const io = getIO();

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      fullName,
      phone,
      city,
      address,
      paymentMethod,
      senderName,
      senderPhone,
      transactionId,
      items,
      isBuyNow,
    } = req.body;

    // ========================================================
    // VALIDATE BASIC DATA
    // ========================================================

    if (!fullName || !phone || !city || !address) {
      return res.status(400).json({
        success: false,
        message: "Shipping information is required",
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Payment method is required",
      });
    }

    if (!["cash", "wallet"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // ========================================================
    // PARSE ITEMS
    // ========================================================

    let requestedItems = [];

    try {
      requestedItems = JSON.parse(items || "[]");
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid items data",
      });
    }

    if (!Array.isArray(requestedItems) || !requestedItems.length) {
      return res.status(400).json({
        success: false,
        message: "No items to checkout",
      });
    }

    // ========================================================
    // WALLET VALIDATION
    // ========================================================

    if (paymentMethod === "wallet") {
      if (!senderName || !senderPhone || !transactionId) {
        return res.status(400).json({
          success: false,
          message: "Wallet payment information is required",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Wallet transfer image is required",
        });
      }
    }

    // ========================================================
    // GET USER
    // ========================================================

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ========================================================
    // VALIDATE PRODUCTS
    // ========================================================

    let totalPrice = 0;

    const orderItems = [];
    const productsToUpdate = [];

    for (const item of requestedItems) {
      if (
        !item.product ||
        !item.color ||
        !item.size ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid cart item",
        });
      }

      const product = await Product.findById(item.product);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const variant = product.variants.find(
        (variant) =>
          variant.color?.name === item.color
      );

      if (!variant) {
        return res.status(400).json({
          success: false,
          message: `Color "${item.color}" not found for ${product.name}`,
        });
      }

      const size = variant.sizes.find(
        (size) => size.size === item.size
      );

      if (!size) {
        return res.status(400).json({
          success: false,
          message: `Size "${item.size}" not found for ${product.name}`,
        });
      }

      if (size.stock < item.quantity) {
        return res.status(409).json({
          success: false,
          message: `${product.name} quantity is not available`,
        });
      }

      const price =
        size.offerPrice != null
          ? size.offerPrice
          : size.price;

      totalPrice += price * item.quantity;

      orderItems.push({
        product: product._id,
        name: product.name,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        price,
        image: product.image,
      });

      productsToUpdate.push({
        product,
        variant,
        size,
        quantity: item.quantity,
      });
    }

    // ========================================================
    // STOCK ROLLBACK
    // ========================================================

    const rollbackStock = async () => {
      for (const item of appliedStockUpdates) {
        try {
          await Product.updateOne(
            {
              _id: item.productId,
            },
            {
              $inc: {
                "variants.$[variant].sizes.$[size].stock":
                  item.quantity,
              },
            },
            {
              arrayFilters: [
                {
                  "variant.color.name": item.color,
                },
                {
                  "size.size": item.size,
                },
              ],
            }
          );
        } catch (error) {
          console.error(
            "Stock rollback error:",
            error.message
          );
        }
      }
    };

    // ========================================================
    // DECREASE STOCK
    // ========================================================

    const touchedProductIds = new Set();

    for (const item of productsToUpdate) {
      const {
        product,
        variant,
        size,
        quantity,
      } = item;

      const result = await Product.updateOne(
        {
          _id: product._id,
        },
        {
          $inc: {
            "variants.$[variant].sizes.$[size].stock":
              -quantity,
          },
        },
        {
          arrayFilters: [
            {
              "variant.color.name":
                variant.color.name,
            },
            {
              "size.size": size.size,
              "size.stock": {
                $gte: quantity,
              },
            },
          ],
        }
      );

      if (result.modifiedCount !== 1) {
        await rollbackStock();

        return res.status(409).json({
          success: false,
          message: `${product.name} (${variant.color.name} / ${size.size}) is no longer available`,
        });
      }

      appliedStockUpdates.push({
        productId: product._id,
        color: variant.color.name,
        size: size.size,
        quantity,
      });

      touchedProductIds.add(
        product._id.toString()
      );

      // ======================================================
      // LOW STOCK
      // ======================================================

      const remainingStock =
        size.stock - quantity;

      if (remainingStock <= 3) {
        const message =
          `Low Stock Warning: "${product.name}" ` +
          `(${variant.color.name} / ${size.size}) ` +
          `has only ${remainingStock} left in stock!`;

        try {
          io.to("adminroom").emit(
            "warning",
            {
              id: product._id,
              name: product.name,
              stock: remainingStock,
              size: size.size,
              color: variant.color.name,
            }
          );

          await Promise.allSettled([
            createNotification({
              title: "Inventory Alert",
              message,
              type: "warning",
            }),

            sendPushToAdmins({
              title: "Inventory Alert",
              body: message,
            }),
          ]);
        } catch (error) {
          console.error(
            "Low stock notification error:",
            error.message
          );
        }
      }
    }

    // ========================================================
    // CLEAR REDIS
    // ========================================================

    try {
      await redis.del("products:all");
      await redis.del("products:latest");

      for (const productId of touchedProductIds) {
        await redis.del(
          `product:${productId}`
        );
      }
    } catch (error) {
      console.error(
        "Redis cache clear error:",
        error.message
      );
    }

    // ========================================================
    // UPLOAD WALLET IMAGE
    // ========================================================

    let imageUrl = "";

    if (
      paymentMethod === "wallet" &&
      req.file
    ) {
      const uploadImage = () =>
        new Promise((resolve, reject) => {
          const stream =
            cloudinary.uploader.upload_stream(
              {
                folder: "wallet",
              },
              (error, result) => {
                if (error) {
                  return reject(error);
                }

                resolve(result);
              }
            );

          streamifier
            .createReadStream(req.file.buffer)
            .pipe(stream);
        });

      const result = await uploadImage();

      imageUrl = result.secure_url;
    }

    // ========================================================
    // CREATE ORDER
    // ========================================================

    let order;

    try {
      order = await Order.create({
        user: user._id,

        items: orderItems,

        shippingAddress: {
          fullName,
          phone,
          city,
          address,
        },

        paymentMethod,

        walletPayment:
          paymentMethod === "wallet"
            ? {
                senderName,
                senderPhone,
                transactionId,
                transferImage: imageUrl,
              }
            : undefined,

        totalPrice,
      });
    } catch (error) {
      await rollbackStock();
      throw error;
    }

    // ========================================================
    // N8N WALLET VERIFICATION
    // ========================================================

    if (
      paymentMethod === "wallet" &&
      imageUrl
    ) {
      axios
        .post(
          "https://asserwael.app.n8n.cloud/webhook-test/payment-verification",
          {
            orderId: order._id.toString(),
            amount: totalPrice,
            senderName,
            senderPhone,
            transactionId,
            imageUrl,
          }
        )
        .catch((error) => {
          console.error(
            "N8N webhook error:",
            error.message
          );
        });
    }

    // ========================================================
    // UPDATE USER
    // ========================================================

    if (isBuyNow !== "true") {
      user.cart = [];
    }

    user.orders.push(order._id);

    await user.save();

    // ========================================================
    // NOTIFICATIONS
    // ========================================================

    try {
      const orderCode = order._id
        .toString()
        .slice(-6)
        .toUpperCase();

      const itemCount =
        orderItems.reduce(
          (total, item) =>
            total + item.quantity,
          0
        );

      const paymentLabel =
        paymentMethod === "wallet"
          ? "E-Wallet"
          : "Cash on Delivery";

      const adminTitle =
        `New Order #${orderCode}`;

      const adminBody =
        `${itemCount} item(s) • ` +
        `Total: ${totalPrice} EGP ` +
        `(${paymentLabel}), ` +
        `${fullName} placed an order`;

      const userTitle =
        `Order Confirmed! #${orderCode}`;

      const userBody =
        `Thank you for your order! ` +
        `We've received your order ` +
        `of ${totalPrice} EGP and are processing it now.`;

      // ======================================================
      // ADMIN SOCKET
      // ======================================================

      io.to("adminroom").emit(
        "newOrder",
        {
          ...order.toObject(),

          orderCode,

          notificationTitle:
            adminTitle,

          notificationBody:
            adminBody,
        }
      );

      // ======================================================
      // PUSH + DATABASE NOTIFICATIONS
      // ======================================================

      await Promise.allSettled([
        sendPushToAdmins({
          title: adminTitle,
          body: adminBody,
        }),

        createNotification({
          title: adminTitle,
          message: adminBody,
          type: "success",
        }),

        sendPushToUser(user._id, {
          title: userTitle,
          body: userBody,
        }),

        createNotificationUser({
          user: user._id,
          title: userTitle,
          message: userBody,
          type: "success",
        }),
      ]);
    } catch (error) {
      console.error(
        "Notification error:",
        error.message
      );
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order,
    });
  } catch (error) {
    console.error(
      "Checkout error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// GET ALL ORDERS
// ============================================================

export const getOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate(
        "user",
        "name email avatar"
      )
      .sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error(
      "Get orders error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// GET CURRENT USER ORDERS
// ============================================================

export const getOrdersUser = async (
  req,
  res
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const user = await User.findById(userId)
      .populate({
        path: "orders",
        options: {
          sort: {
            createdAt: -1,
          },
        },
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      orders: user.orders,
    });
  } catch (error) {
    console.error(
      "Get user orders error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// GET SINGLE ORDER
// ============================================================

export const getOrder = async (
  req,
  res
) => {
  try {
    const order =
      await Order.findById(
        req.params.id
      ).populate(
        "user",
        "name email avatar"
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error(
      "Get order error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// GET ORDERS BY USER
// ============================================================

export const getOrdersByUser = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate({
        path: "orders",
        options: {
          sort: {
            createdAt: -1,
          },
        },
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      orders: user.orders,
    });
  } catch (error) {
    console.error(
      "Get orders by user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// CHANGE ORDER STATUS
// ============================================================

export const changeStatus = async (
  req,
  res
) => {
  try {
    const io = getIO();

    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
    ];

    if (
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
    }

    const order =
      await Order.findById(
        req.params.id
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status === status) {
      return res.status(400).json({
        success: false,
        message:
          "Order already has this status",
      });
    }

    order.status = status;

    await order.save();

    const orderCode = order._id
      .toString()
      .slice(-6)
      .toUpperCase();

    const statusMessages = {
      pending: {
        title:
          `Order #${orderCode} Status Update`,
        body:
          "Your order is currently pending review.",
        type: "info",
      },

      confirmed: {
        title:
          `Order #${orderCode} is Confirmed`,
        body:
          "Your order has been confirmed and is being prepared.",
        type: "info",
      },

      shipped: {
        title:
          `Order #${orderCode} Has Been Shipped`,
        body:
          "Your package is on its way.",
        type: "info",
      },

      delivered: {
        title:
          `Order #${orderCode} Delivered`,
        body:
          "Your order has been delivered successfully.",
        type: "success",
      },

      cancelled: {
        title:
          `Order #${orderCode} Cancelled`,
        body:
          "Your order has been cancelled.",
        type: "error",
      },
    };

    const notification =
      statusMessages[status];

    // ========================================================
    // USER SOCKET ROOM
    // ========================================================

    io.to(
      `userOrder-${order._id.toString()}`
    ).emit("orderStatus", {
      orderId: order._id.toString(),
      status,
      orderCode,
      title: notification.title,
      body: notification.body,
    });

    // ========================================================
    // PUSH + DATABASE
    // ========================================================

    await Promise.allSettled([
      sendPushToUser(order.user, {
        title: notification.title,
        body: notification.body,
      }),

      createNotificationUser({
        user: order.user,
        title: notification.title,
        message: notification.body,
        type: notification.type,
      }),

      createNotification({
        title:
          `Order #${orderCode} Status Changed`,
        message:
          `Order #${orderCode} changed to ${status.toUpperCase()}`,
        type: "info",
      }),
    ]);

    return res.json({
      success: true,
      message:
        "Status updated successfully",
      order,
    });
  } catch (error) {
    console.error(
      "Change status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// DELETE ORDER
// ============================================================

export const deleteOrder = async (
  req,
  res
) => {
  try {
    // IMPORTANT:
    // This was missing in your code
    const io = getIO();

    const order =
      await Order.findById(
        req.params.id
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    await User.findByIdAndUpdate(
      order.user,
      {
        $pull: {
          orders: order._id,
        },
      }
    );

    await order.deleteOne();

    // Notify user if currently connected
    io.to(
      `userOrder-${order._id.toString()}`
    ).emit("orderDeleted", {
      orderId: order._id.toString(),
    });

    return res.json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete order error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};