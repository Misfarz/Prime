/**
 * Utility for sending wallet transaction notifications
 */
const User = require('../models/userSchema');

/**
 * Sends a notification about wallet transactions
 * In a real application, this would integrate with email, SMS, or push notifications
 * For now, we'll just log the notification and store it in the user's notifications array
 * 
 * @param {String} userId - The user ID to notify
 * @param {String} type - The type of transaction (credit/debit)
 * @param {Number} amount - The transaction amount
 * @param {String} description - Description of the transaction
 * @returns {Promise<Boolean>} - Success status
 */
const sendWalletNotification = async (userId, type, amount, description) => {
    try {
        // Create notification message
        const action = type === 'credit' ? 'added to' : 'deducted from';
        const message = `₹${amount.toFixed(2)} has been ${action} your wallet. ${description}`;
        
        // Log the notification (for development purposes)
        console.log(`Wallet notification for user ${userId}: ${message}`);
        
        // Store notification in user's notifications array
        // This assumes the User schema has a notifications array field
        // If it doesn't exist, you would need to add it to the schema
        await User.findByIdAndUpdate(
            userId,
            { 
                $push: { 
                    notifications: {
                        message,
                        type: 'wallet',
                        read: false,
                        createdAt: new Date()
                    } 
                } 
            }
        );
        
        return true;
    } catch (error) {
        console.error('Failed to send wallet notification:', error);
        return false;
    }
};

module.exports = {
    sendWalletNotification
};
