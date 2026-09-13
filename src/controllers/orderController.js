import axios from "axios";
import streamifier from "streamifier";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import redis from "../config/redis.js";
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
    try {
        const io = getIO();

        let imageUrl = "";

        // Upload wallet transfer image if provided
        if (req.file) {
            const streamUpload = () =>
                new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: "wallet" },
                        (error, result) => {
                            if (error) return reject(error);
                            resolve(result);
                        }
                    );

                    streamifier
                        .createReadStream(req.file.buffer)
                        .pipe(stream);
                });

            const result = await streamUpload();
            imageUrl = result.secure_url;
        }

        const { fullName, phone, city, address, paymentMethod,
            senderName, senderPhone, transactionId, items, isBuyNow } = req.body;

        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
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

            const variant = product.variants.find((v) => v.color?.name === item.color);
            if (!variant) {
                return res.status(400).json({
                    success: false,
                    message: `Color "${item.color}" not found for ${product.name}`,
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
                color: item.color,
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
                                { "v.color.name": applied.color },
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
                        { "v.color.name": variant.color.name },
                        { "s.size": size.size, "s.stock": { $gte: quantity } },
                    ],
                }
            );

            if (decrementResult.modifiedCount !== 1) {
                // Someone else took the remaining stock in the meantime.
                await rollbackAppliedStockUpdates();

                return res.status(409).json({
                    success: false,
                    message: `${product.name} (${variant.color.name} / ${size.size}) is no longer available in the requested quantity`,
                });
            }

            appliedStockUpdates.push({
                productId: product._id,
                color: variant.color.name,
                size: size.size,
                quantity,
            });
            touchedProductIds.add(product._id.toString());

            // Low stock check — based on the stock we just observed locally;
            // it's only used for the informational admin alert, not for any
            // stock decision, so approximate freshness here is fine.
            const remainingStock = size.stock - quantity;
            if (remainingStock <= 3) {
                const lowStockMessage = `Low Stock Warning: "${product.name}" (${variant.color.name} / ${size.size}) has only ${remainingStock} left in stock!`;

                try {
                    io.to("adminroom").emit("warning", {
                        id: product._id,
                        name: product.name,
                        stock: remainingStock,
                        size: size.size,
                        color: variant.color.name,
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
            const paymentLabel = paymentMethod === "wallet" ? "E-Wallet" : "Cash on Delivery";

            // Admin Notification Message (Shopify Merchant Style)
            const adminPushTitle = `New Order #${orderCode}`;
            const adminPushBody = `${itemCount} item(s) • Total: ${totalPrice} EGP (${paymentLabel}), ${fullName} placed an order`;

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


// ============================================================
// GET /orders
// Admin - Get all orders
// ============================================================
export const getOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate("user", "name email avatar")
            .sort({ createdAt: -1 });

        return res.json({
            success: true,
            orders,
        });
    } catch (error) {
        console.error("Get orders error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// GET /orders/user
// Get current user's orders
// ============================================================
export const getOrdersUser = async (req, res) => {
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
            })

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
        console.error("Get user orders error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// GET /orders/:id
// Admin - Get single order
// ============================================================
export const getOrder = async (req, res) => {
    try {
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
    } catch (error) {
        console.error("Get order error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// GET /orders/user/:id
// Admin - Get orders for specific user
// ============================================================
export const getOrdersByUser = async (req, res) => {
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
        console.error("Get orders by user error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};


// ============================================================
// PUT /orders/:id/status
// Change order status with Shopify-style customer updates
// ============================================================
// ============================================================
// PUT /orders/:id/status
// Change order status with Shopify-style customer updates
// ============================================================
export const changeStatus = async (req, res) => {
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

        // 🔔 إرسال الحدث إلى غرفة الطلب بناءً على ID الطلب
        io.to(order._id.toString()).emit("orderStatus", {
            orderId: order._id,
            status,
            orderCode,
            title: currentStatusConfig.title,
            body: currentStatusConfig.body,
        });

        // Push Notifications & DB Notifications
        await sendPushToUser({userId: order.user, payload :{
            title: currentStatusConfig.title,
            body: currentStatusConfig.body,
        }});

        await createNotificationUser({
            user: order.user,
            title: currentStatusConfig.title,
            message: currentStatusConfig.body,
            type: currentStatusConfig.type,
        });

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
    } catch (error) {
        console.error("Change status error:", error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// ============================================================
// DELETE /orders/:id
// Admin - Delete order
// ============================================================
export const deleteOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        await User.findByIdAndUpdate(order.user, {
            $pull: { orders: order._id },
        });

        await order.deleteOne();

        const io = getIO();

        // 🔔 إرسال حدث الحذف
        io.to(order._id.toString()).emit("orderDeleted", {
            orderId: order._id,
        });

        return res.json({
            success: true,
            message: "Order deleted successfully",
        });
    } catch (error) {
        console.error("Delete order error:", error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};
