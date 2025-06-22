const Razorpay = require('razorpay');
const crypto = require('crypto');


const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a Razorpay order
 * @param {Object} options { amount, currency, receipt, notes }
 * @returns {Promise<Object>} Razorpay order object
 */
const createRazorpayOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) => {
  return await razorpayInstance.orders.create({
    amount, // amount in paise
    currency,
    receipt,
    notes,
  });
};

/**
 * Verify the Razorpay payment signature on the server
 * @param {Object} params { order_id, payment_id, signature }
 * @returns {Boolean}
 */
const verifyPaymentSignature = ({ order_id, payment_id, signature }) => {
  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  hmac.update(`${order_id}|${payment_id}`);
  const generatedSignature = hmac.digest('hex');
  return generatedSignature === signature;
};

module.exports = {
  createRazorpayOrder,
  verifyPaymentSignature,
};
