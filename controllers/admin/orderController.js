const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const { sendWalletNotification } = require("../../utils/walletNotifier");

const loadOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchQuery = req.query.search || "";
    const sortField = req.query.sortField || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const statusFilter = req.query.status || "";
    const returnFilter = req.query.returnFilter || "";

    let filter = {};

    if (searchQuery) {
      filter.$or = [{ orderNumber: { $regex: searchQuery, $options: "i" } }];
    }

    if (statusFilter) {
      filter.orderStatus = statusFilter;
    }

    // Add filter for return verification requests
    if (returnFilter === "pending") {
      filter.orderStatus = "Returned";
      filter.returnStatus = "For Verification";
    }

    const sort = {};
    sort[sortField] = sortOrder;

    const orders = await Order.find(filter)
      .populate("user", "name email phone")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalOrders / limit);

    const statuses = await Order.distinct("orderStatus");

    res.render("aorder", {
      admin: true,
      orders,
      currentPage: page,
      totalPages,
      totalOrders,
      limit,
      searchQuery,
      sortField,
      sortOrder: sortOrder === 1 ? "asc" : "desc",
      statusFilter,
      returnFilter,
      statuses,
      activeTab: "orders",
    });
  } catch (error) {
    console.error("Error loading admin orders page:", error);
    res.status(500).render("admin/error", {
      error: "Failed to load orders page",
      activeTab: "orders",
    });
  }
};

const loadOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await Order.findById(orderId)
      .populate("user", "firstName lastName email phone")
      .populate({
        path: "items.product",
        select: "productName productImage regularPrice salePrice stock",
      });

    if (!order) {
      return res.redirect("/admin/orders");
    }

    res.render("aorder-details", {
      admin: true,
      order,
      activeTab: "orders",
    });
  } catch (error) {
    console.error("Error loading order details:", error);
    res.status(500).render("admin/error", {
      error: "Failed to load order details",
      activeTab: "orders",
    });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    const validStatuses = [
      "Placed",
      "Processing",
      "Shipped",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
      "Refunded",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.orderStatus = status;

    if (status === "Delivered") {
      order.deliveredAt = new Date();
    }

    if (status === "Cancelled") {
      order.cancelledAt = new Date();
    }

    // Handle refund to wallet if status is changed to 'Refunded'
    if (status === "Refunded" && order.paymentStatus !== "Refunded") {
      try {
        // Update payment status to Refunded
        order.paymentStatus = "Refunded";

        // Find the user
        const user = await User.findById(order.user);
        if (!user) {
          throw new Error("User not found");
        }

        // Add refund amount to user's wallet
        user.wallet += order.total;
        await user.save();

        // Create wallet transaction record
        const walletTransaction = await WalletTransaction.create({
          user: order.user,
          amount: order.total,
          type: "credit",
          description: `Refund for order #${order.orderNumber}`,
          orderId: order._id,
          date: new Date(),
        });

        // Send notification about the wallet transaction
        await sendWalletNotification(
          order.user,
          "credit",
          order.total,
          `Refund for order #${order.orderNumber}`
        );

        console.log(
          `Refunded ${order.total} to user wallet for order ${order._id}`
        );
      } catch (refundError) {
        console.error("Error processing refund:", refundError);
        // We still save the order status but log the refund error
      }
    }

    // Save the order with all updates
    await order.save();

    res.json({
      success: true,
      message: "Order status updated successfully",
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update order status",
    });
  }
};

const verifyReturnRequest = async (req, res) => {
  try {
    const { orderId, action } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.orderStatus !== "Returned") {
      return res.status(400).json({
        success: false,
        message: "Order is not in returned status",
      });
    }

    if (action === "approve") {
      const user = await User.findById(order.user);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      for (const item of order.items) {
        try {
          const productId = item.product;
          const size = item.size;
          const quantity = item.quantity;

          const product = await Product.findById(productId);

          if (!product) {
            console.error(`Product not found: ${productId}`);
            continue;
          }

          const sizeIndex = product.sizes.findIndex((s) => s.size === size);

          if (sizeIndex !== -1) {
            product.sizes[sizeIndex].quantity += quantity;

            if (product.status === "Out of stock") {
              product.status = "Available";
            }

            await product.save();

            console.log(
              `Restored stock for ${product.productName}, size ${size}: ${product.sizes[sizeIndex].quantity}`
            );
          } else {
            console.error(
              `Size ${size} not found for product ${product.productName}`
            );
          }
        } catch (error) {
          console.error(
            `Error updating stock for product ${item.product}:`,
            error
          );
        }
      }

      // Add the refunded amount to the user's wallet
      if (
        order.paymentStatus === "Paid" ||
        order.paymentMethod === "wallet" ||
        order.paymentMethod === "razorpay" ||
        order.paymentMethod === "cod"
      ) {
        try {
          console.log(
            `Processing refund for order ${order._id}. Current wallet: ${user.wallet}, Order total: ${order.total}`
          );

          // Ensure wallet is treated as a number and handle null/undefined cases
          const currentWallet = Number(user.wallet || 0);
          const refundAmount = Number(order.total);

          if (isNaN(currentWallet) || isNaN(refundAmount)) {
            throw new Error(
              `Invalid wallet (${user.wallet}) or refund amount (${order.total})`
            );
          }

          // Update user wallet balance
          user.wallet = currentWallet + refundAmount;
          const savedUser = await user.save();

          if (!savedUser) {
            throw new Error("Failed to save user after wallet update");
          }

          console.log(
            `Updated user wallet. Previous: ${currentWallet}, Added: ${refundAmount}, New: ${savedUser.wallet}`
          );

          // Create wallet transaction record
          const walletTransaction = await WalletTransaction.create({
            user: order.user,
            amount: refundAmount,
            type: "credit",
            description: `Refund for returned order #${order.orderNumber}`,
            orderId: order._id,
            date: new Date(),
          });

          if (!walletTransaction) {
            throw new Error("Failed to create wallet transaction");
          }

          console.log(`Created wallet transaction: ${walletTransaction._id}`);

          // Send notification about the wallet transaction
          await sendWalletNotification(
            order.user,
            "credit",
            refundAmount,
            `Refund for returned order #${order.orderNumber}`
          );

          console.log(
            `Refunded ${refundAmount} to user wallet for returned order ${order._id}`
          );

          // Update order payment status
          order.paymentStatus = "Refunded";
          // Save order immediately after updating payment status
          await order.save();
          console.log(
            `Updated order payment status to Refunded and saved order ${order._id}`
          );
        } catch (error) {
          console.error(
            `Error processing refund for returned order ${order._id}:`,
            error
          );
          // Continue with return approval even if refund fails
        }
      } else {
        // Set payment status to Refunded even if no wallet refund was needed
        order.paymentStatus = "Refunded";
        // Save order immediately after updating payment status
        await order.save();
        console.log(
          `Updated order payment status to Refunded and saved order ${order._id}`
        );
      }
      // Update the return status to 'Approved' so it doesn't show as 'For Verification' anymore
      order.returnStatus = "Approved";
      await order.save();

      res.json({
        success: true,
        message:
          "Return approved, amount refunded to wallet, and product stock restored",
      });
    } else if (action === "reject") {
      order.orderStatus = "Delivered";
      // Update the return status to 'Rejected' so it doesn't show as 'For Verification' anymore
      order.returnStatus = "Rejected";
      // Keep the return reason and date for record purposes
      await order.save();

      res.json({
        success: true,
        message: "Return request rejected",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid action",
      });
    }
  } catch (error) {
    console.error("Error verifying return request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify return request",
    });
  }
};

module.exports = {
  loadOrders,
  loadOrderDetails,
  updateOrderStatus,
  verifyReturnRequest,
};
