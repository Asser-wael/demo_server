import User from "../models/User.js";
import Product from "../models/Product.js";

// GET /cart
export const getCart = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate(
            "cart.product",
            "name image variants"
        );

        if (!user)
            return res.status(404).json({
                message: "المستخدم غير موجود"
            });

        res.status(200).json({
            success: true,
            cart: user.cart,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// POST /cart/add
export const addToCart = async (req, res) => {
    try {
        const { productId, color, size, quantity } = req.body;

        const product = await Product.findById(productId);

        if (!product)
            return res.status(404).json({ message: "المنتج غير موجود" });

        const variant = product.variants.find(
            (v) => v.color.name === color
        );

        if (!variant)
            return res.status(400).json({ message: "اللون غير موجود" });

        const sizeObj = variant.sizes.find((s) => s.size === size);

        if (!sizeObj)
            return res.status(400).json({ message: "المقاس غير موجود" });

        const qty = quantity || 1;

        if (sizeObj.stock < qty)
            return res.status(400).json({ message: "الكمية غير متوفرة" });

        const user = await User.findById(req.user.id);

        const existingItem = user.cart.find(
            (item) =>
                item.product.toString() === productId &&
                item.color === color &&
                item.size === size
        );

        if (existingItem) {
            const newQty = existingItem.quantity + qty;

            if (sizeObj.stock < newQty)
                return res
                    .status(400)
                    .json({ message: "الكمية غير متوفرة" });

            existingItem.quantity = newQty;
        } else {
            user.cart.push({
                product: productId,
                color,
                size,
                quantity: qty,
            });
        }

        await user.save();

        const populatedUser = await user.populate(
            "cart.product",
            "name image variants"
        );

        res.status(200).json({
            success: true,
            message: "تمت الإضافة إلى السلة",
            cart: populatedUser.cart,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// PUT /cart/update
export const updateCartItem = async (req, res) => {
    try {
        const { productId, color, size, quantity } = req.body;

        if (quantity < 1)
            return res
                .status(400)
                .json({ message: "الكمية يجب أن تكون أكبر من صفر" });

        const product = await Product.findById(productId);

        if (!product)
            return res.status(404).json({ message: "المنتج غير موجود" });

        const variant = product.variants.find(
            (v) => v.color.name === color
        );
        const sizeObj = variant?.sizes.find((s) => s.size === size);

        if (!sizeObj)
            return res.status(400).json({ message: "المقاس غير موجود" });

        if (sizeObj.stock < quantity)
            return res.status(400).json({ message: "الكمية غير متوفرة" });

        const user = await User.findById(req.user.id);

        const item = user.cart.find(
            (item) =>
                item.product.toString() === productId &&
                item.color === color &&
                item.size === size
        );

        if (!item)
            return res
                .status(404)
                .json({ message: "المنتج غير موجود في السلة" });

        item.quantity = quantity;

        await user.save();

        const populatedUser = await user.populate(
            "cart.product",
            "name image variants"
        );

        res.status(200).json({
            success: true,
            message: "تم تحديث السلة",
            cart: populatedUser.cart,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// DELETE /cart/remove
export const removeFromCart = async (req, res) => {
    try {
        const { productId, color, size } = req.body;

        const user = await User.findById(req.user.id);

        if (!user)
            return res.status(404).json({ message: "المستخدم غير موجود" });

        user.cart = user.cart.filter(
            (item) =>
                !(
                    item.product.toString() === productId &&
                    item.color === color &&
                    item.size === size
                )
        );

        await user.save();

        const populatedUser = await user.populate(
            "cart.product",
            "name image variants"
        );

        res.status(200).json({
            success: true,
            message: "تم حذف المنتج من السلة",
            cart: populatedUser.cart,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// DELETE /cart/clear
export const clearCart = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user)
            return res.status(404).json({ message: "المستخدم غير موجود" });

        user.cart = [];
        await user.save();

        res.status(200).json({
            success: true,
            message: "تم تفريغ السلة",
            cart: [],
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};