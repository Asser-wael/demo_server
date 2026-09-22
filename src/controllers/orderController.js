import axios from "axios";
import mongoose from "mongoose";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import redis from "../config/redis.js";
import { getIO } from "../sockets/index.js";
import uploadImage from "../utils/uploadImage.js";
import errorCatch from "../utils/errorCatch.js";
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
    try {
        const io = getIO();

        const { fullName, phone, city, address, paymentMethod, orderType, tableNumber,
            senderName, senderPhone, transactionId, items, isBuyNow } = req.body;

        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // --------------------------------------------------------
        // Validate orderType, paymentMethod, and the fields that are
        // actually required for the chosen orderType — before doing any
        // real work (including the wallet-image upload below), so an
        // invalid request fails fast instead of burning a Cloudinary
        // upload on a request we're going to reject anyway.
        // --------------------------------------------------------
        const allowedOrderTypes = ["takeaway", "dine_in", "delivery"];
        if (!allowedOrderTypes.includes(orderType)) {
            return res.status(400).json({ success: false, message: "Please choose a valid order type" });
        }

        const allowedPaymentMethods = ["cash", "wallet"];
        if (!allowedPaymentMethods.includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: "Please choose a valid payment method" });
        }

        let shippingAddress;
        let finalTableNumber = null;

        if (orderType === "delivery") {
            if (!fullName?.trim() || !phone?.trim() || !city?.trim() || !address?.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Full name, phone, city and address are required for delivery orders",
                });
            }

            shippingAddress = {
                fullName: fullName.trim(),
                phone: phone.trim(),
                city: city.trim(),
                address: address.trim(),
            };
        } else if (orderType === "dine_in") {
            if (!tableNumber?.toString().trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Table number is required for dine-in orders",
                });
            }

            finalTableNumber = tableNumber.toString().trim();

            // Name/phone are optional here — the order is already tied to
            // the logged-in account, this is only useful if staff want a
            // name to call out.
            if (fullName?.trim() || phone?.trim()) {
                shippingAddress = { fullName: fullName?.trim(), phone: phone?.trim() };
            }
        } else {
            // takeaway — nothing is required beyond the account itself.
            if (fullName?.trim() || phone?.trim()) {
                shippingAddress = { fullName: fullName?.trim(), phone: phone?.trim() };
            }
        }

        let imageUrl = "";

        // Upload wallet transfer image if provided
        if (req.file) {
            const result = await uploadImage(req.file, "wallet");
            imageUrl = result.secure_url;
        }

        // اقرأ الـ items من الريكوست بدل ما تعتمد على user.cart فقط
        const requestedItems = JSON.parse(items || "[]");

        if (!requestedItems.length) {
            return res.status(400).json({ success: false, message: "No items to checkout" });
        }

        let totalPrice = 0;
        const orderItems = [];
        const productsToUpdate = [];

        for (const item of requestedItems) {
            const product = await Product.findById(item.product);
            if (!product) {
                return res.status(404).json({ success: false, message: "Product not found" });
            }

            const variant = product.variants.find((v) => v.variant?.name === item.variant);
            if (!variant) {
                return res.status(400).json({
                    success: false,
                    message: `Variant "${item.variant}" not found for ${product.name}`,
                });
            }

            const size = variant.sizes.find((s) => s.size === item.size);
            if (!size) {
                return res.status(400).json({
                    success: false,
                    message: `Size "${item.size}" not found for ${product.name}`,
                });
            }

            if (size.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} quantity not available`,
                });
            }

            const price = size.offerPrice != null ? size.offerPrice : size.price;
            totalPrice += price * item.quantity;

            orderItems.push({
                product: product._id,
                name: product.name,
                variant: item.variant,
                size: item.size,
                quantity: item.quantity,
                price,
                image: product.image,
            });

            productsToUpdate.push({ product, variant, size, quantity: item.quantity });
        }

        // --------------------------------------------------------
        // Update stock atomically & notify if low stock
        // --------------------------------------------------------
        // Stock is decremented with a single conditional update per item
        // (stock only decreases if enough is still available at the moment
        // of the write). This prevents two concurrent checkouts from both
        // passing the earlier in-memory check and overselling the same
        // stock. If any item fails (lost the race / went out of stock),
        // every previously-applied decrement in this checkout is rolled
        // back and the whole checkout is rejected — no partial orders.
        const touchedProductIds = new Set();
        const appliedStockUpdates = [];

        const rollbackAppliedStockUpdates = async () => {
            for (const applied of appliedStockUpdates) {
                try {
                    await Product.updateOne(
                        { _id: applied.productId },
                        { $inc: { "variants.$[v].sizes.$[s].stock": applied.quantity } },
                        {
                            arrayFilters: [
                                { "v.variant.name": applied.variant },
                                { "s.size": applied.size },
                            ],
                        }
                    );
                } catch (rollbackErr) {
                    console.error("Stock rollback failed:", rollbackErr.message);
                }
            }
        };

        for (const item of productsToUpdate) {
            const { product, variant, size, quantity } = item;

            const decrementResult = await Product.updateOne(
                { _id: product._id },
                { $inc: { "variants.$[v].sizes.$[s].stock": -quantity } },
                {
                    arrayFilters: [
                        { "v.variant.name": variant.variant.name },
                        { "s.size": size.size, "s.stock": { $gte: quantity } },
                    ],
                }
            );

            if (decrementResult.modifiedCount !== 1) {
                // Someone else took the remaining stock in the meantime.
                await rollbackAppliedStockUpdates();

                return res.status(409).json({
                    success: false,
                    message: `${product.name} (${variant.variant.name} / ${size.size}) is no longer available in the requested quantity`,
                });
            }

            appliedStockUpdates.push({
                productId: product._id,
                variant: variant.variant.name,
                size: size.size,
                quantity,
            });
            touchedProductIds.add(product._id.toString());

            // Low stock check — based on the stock we just observed locally;
            // it's only used for the informational admin alert, not for any
            // stock decision, so approximate freshness here is fine.
            const remainingStock = size.stock - quantity;
            if (remainingStock <= 3) {
                const lowStockMessage = `Low Stock Warning: "${product.name}" (${variant.variant.name} / ${size.size}) has only ${remainingStock} left in stock!`;

                try {
                    io.to("adminroom").emit("warning", {
                        id: product._id,
                        name: product.name,
                        stock: remainingStock,
                        size: size.size,
                        variant: variant.variant.name,
                    });

                    await createNotification({
                        title: "⚠️ Inventory Alert",
                        message: lowStockMessage,
                        type: "warning",
                    });

                    await sendPushToAdmins({
                        title: "⚠️ Inventory Alert",
                        body: lowStockMessage,
                    });
                } catch (notiError) {
                    console.error("Failed to send low-stock notifications:", notiError.message);
                }
            }
        }

        // Clear Redis cache safely
        try {
            await redis.del("products:all");
            for (const productId of touchedProductIds) {
                await redis.del(`product:${productId}`);
            }
        } catch (redisErr) {
            console.error("Redis Cache Clear Error:", redisErr.message);
        }

        // --------------------------------------------------------
        // Create Order
        // --------------------------------------------------------
        let order;
        try {
            order = await Order.create({
                user: user._id,
                items: orderItems,
                orderType,
                tableNumber: finalTableNumber,
                shippingAddress,
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
        } catch (orderCreateError) {
            // The order was never created — give back the stock we already
            // reserved above so it isn't lost.
            await rollbackAppliedStockUpdates();
            throw orderCreateError;
        }

        // -------------------------------------------------------- 
        // TRIGGER N8N WORKFLOW (IF WALLET PAYMENT)
        // -------------------------------------------------------- 
        if (paymentMethod === "wallet" && imageUrl) {
            axios.post("https://asserwael.app.n8n.cloud/webhook-test/payment-verification", {
                orderId: order._id,
                amount: totalPrice,
                senderName,
                senderPhone,
                transactionId,
                imageUrl,
            }).catch(err => {
                console.error("Failed to trigger n8n workflow:", err.message);
            });
        }

        if (isBuyNow !== "true") user.cart = [];

        user.orders.push(order._id);
        await user.save();

        // --------------------------------------------------------
        // SHOPIFY-STYLE NOTIFICATION PAYLOADS (SAFE EXECUTION)
        // --------------------------------------------------------
        try {
            const orderCode = order._id.toString().slice(-6).toUpperCase();
            const itemCount = orderItems.reduce((acc, curr) => acc + curr.quantity, 0);
            const paymentLabel = paymentMethod === "wallet" ? "E-Wallet" : "Cash";
            const orderTypeLabel = {
                delivery: "Delivery",
                takeaway: "Takeaway",
                dine_in: "Dine In",
            }[orderType];
            const customerName = shippingAddress?.fullName?.trim() || user.name;

            // Admin Notification Message (Shopify Merchant Style)
            const adminPushTitle = `New Order #${orderCode}`;
            const adminPushBody = `${itemCount} item(s) • Total: ${totalPrice} EGP (${paymentLabel}, ${orderTypeLabel}), ${customerName} placed an order`;

            // User Notification Message (Shopify Customer Style)
            const userPushTitle = `🎉 Order Confirmed! #${orderCode}`;
            const userPushBody = `Thank you for your order! We've received your payment request of ${totalPrice} EGP and are processing it now.`;

            // Realtime WebSockets Emit to Admin Room
            io.to("adminroom").emit("newOrder", {
                ...order.toObject(),
                orderCode,
                notificationTitle: adminPushTitle,
                notificationBody: adminPushBody,
            });

            // Push Notifications & DB Notifications in parallel (Settled so one failure doesn't stop others)
            await Promise.allSettled([
                sendPushToAdmins({
                    title: adminPushTitle,
                    body: adminPushBody,
                }),
                createNotification({
                    title: adminPushTitle,
                    message: adminPushBody,
                    type: "success",
                }),
                sendPushToUser(user._id, {
                    title: userPushTitle,
                    body: userPushBody,
                }),
                createNotificationUser({
                    user: user._id,
                    title: userPushTitle,
                    message: userPushBody,
                    type: "success",
                })
            ]);
        } catch (notificationError) {
            console.error("Checkout Notifications Failed:", notificationError.message);
        }

        return res.status(201).json({
            success: true,
            message: "Order placed successfully",
            order,
        });
    } catch (error) {
        console.error("Checkout error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


export const getOrders = errorCatch(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [orders, totalOrders] = await Promise.all([
        Order.find()
            .populate("user", "name email avatar")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Order.countDocuments(),
    ]);

    return res.json({
        success: true,
        orders,
        pagination: {
            page,
            limit,
            totalOrders,
            totalPages: Math.ceil(totalOrders / limit),
        },
    });
});


export const getOrdersUser = errorCatch(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const userExists = await User.exists({ _id: userId });

    if (!userExists) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    const [orders, totalOrders, statsAgg] = await Promise.all([
        Order.find({ user: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Order.countDocuments({ user: userId }),

        Order.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    totalSpent: { $sum: "$totalPrice" },
                    pendingCount: {
                        $sum: {
                            $cond: [
                                { $in: ["$status", ["pending", "confirmed"]] },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]),
    ]);

    const stats = statsAgg[0] || { totalSpent: 0, pendingCount: 0 };

    return res.json({
        success: true,
        orders,
        stats: {
            totalOrders,
            totalSpent: stats.totalSpent,
            pendingOrders: stats.pendingCount,
        },
        pagination: {
            page,
            limit,
            totalOrders,
            totalPages: Math.ceil(totalOrders / limit),
        },
    });
});


// ============================================================
// GET /orders/:id
// Admin - Get single order
// ============================================================
export const getOrder = errorCatch(async (req, res) => {
    const order = await Order.findById(req.params.id)
        .populate("user", "name email avatar");

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
});


// ============================================================
// GET /orders/user/:id
// Admin - Get orders for specific user
// ============================================================
export const getOrdersByUser = errorCatch(async (req, res) => {
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
});


// ============================================================
// PUT /orders/:id/status
// Change order status with Shopify-style customer updates
// ============================================================
export const changeStatus = errorCatch(async (req, res) => {
    const io = getIO();
    const { status } = req.body;

    const allowedStatuses = [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            message: "Invalid order status",
        });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
        return res.status(404).json({
            success: false,
            message: "Order not found",
        });
    }

    if (order.status === status) {
        return res.status(400).json({
            success: false,
            message: "Order already has this status",
        });
    }

    order.status = status;
    await order.save();

    // --------------------------------------------------------
    // SHOPIFY-STYLE ORDER STATUS MESSAGES
    // --------------------------------------------------------
    const orderCode = order._id.toString().slice(-6).toUpperCase();

    const statusMessages = {
        pending: {
            title: `⏳ Order #${orderCode} Status Update`,
            body: "Your order is currently pending review.",
            type: "info",
        },

        confirmed: {
            title: `📦 Order #${orderCode} is Confirmed`,
            body: "Great news! Your order has been confirmed and is being prepared.",
            type: "info",
        },

        shipped: {
            title: `🚚 Order #${orderCode} Has Been Shipped!`,
            body: "Your package is on its way! Get ready to receive your items soon.",
            type: "info",
        },

        delivered: {
            title: `✅ Order #${orderCode} Delivered!`,
            body: "Your order has been delivered successfully. We hope you enjoy your purchase!",
            type: "success",
        },

        cancelled: {
            title: `❌ Order #${orderCode} Cancelled`,
            body: "Your order has been cancelled. Please contact customer support if you need further assistance.",
            type: "error",
        },
    };

    const currentStatusConfig = statusMessages[status] || statusMessages.pending;

    // Realtime Event — sent to every socket this user has open (they auto-
    // join their own `user:<id>` room on connect), not just one that
    // happened to subscribe to this specific order.
    io.to(`user:${order.user}`).emit("orderStatus", {
        orderId: order._id,
        status,
        orderCode,
        title: currentStatusConfig.title,
        body: currentStatusConfig.body,
    });

    // Send Push & DB Notification to User
    await sendPushToUser(order.user, {
        title: currentStatusConfig.title,
        body: currentStatusConfig.body,
    });

    await createNotificationUser({
        user: order.user,
        title: currentStatusConfig.title,
        message: currentStatusConfig.body,
        type: currentStatusConfig.type,
    });

    // Admin Notification
    await createNotification({
        title: `Order #${orderCode} Status Changed`,
        message: `Order status for #${orderCode} was changed to: ${status.toUpperCase()}`,
        type: "info",
    });

    return res.json({
        success: true,
        message: "Status updated successfully",
        order,
    });
});


// ============================================================
// DELETE /orders/:id
// Admin - Delete order
// ============================================================
export const deleteOrder = errorCatch(async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (!order) {
        return res.status(404).json({
            success: false,
            message: "Order not found",
        });
    }

    // Remove order ID from user
    await User.findByIdAndUpdate(
        order.user,
        {
            $pull: {
                orders: order._id,
            },
        }
    );

    // Realtime — capture the owner before the order is deleted.
    const orderOwnerId = order.user;

    await order.deleteOne();

    const io = getIO();

    io.to(`user:${orderOwnerId}`).emit(
        "orderDeleted",
        {
            orderId: order._id,
        }
    );

    return res.json({
        success: true,
        message: "Order deleted successfully",
    });
});