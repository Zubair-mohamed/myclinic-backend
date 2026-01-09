const mongoose = require('mongoose');
const Wallet = require('../models/wallet');
const Transaction = require('../models/transaction');

/**
 * Gets a user's wallet, creating one if it doesn't exist.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Document>} The user's wallet document.
 */
const getOrCreateWallet = async (userId) => {
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
        wallet = await Wallet.create({ user: userId, balance: 0 });
    }
    return wallet;
};

/**
 * Creates a transaction and updates the user's wallet balance. Can operate within an existing
 * Mongoose session or create its own transaction.
 * @param {object} transactionData - The data for the new transaction.
 * @param {object} [options={}] - Options for the transaction.
 * @param {mongoose.ClientSession} [options.session] - An optional existing Mongoose session.
 * @returns {Promise<Document>} The newly created transaction document.
 */
const createTransactionAndUpdateWallet = async (transactionData, options = {}) => {
    const { session: existingSession } = options;
    const { userId, amount, type, transactionType, description, referenceId, hospitalId } = transactionData;
    
    if (userId === undefined || amount === undefined || type === undefined || transactionType === undefined || description === undefined || referenceId === undefined) {
        throw new Error('Missing required fields for transaction.');
    }
    
    const performDbOperations = async (session) => {
        const wallet = await Wallet.findOne({ user: userId }).session(session);
        if (!wallet) {
            throw new Error('Wallet not found for this user.');
        }

        const balanceChange = type === 'credit' ? amount : -amount;
        
        if (type === 'debit' && wallet.balance < amount) {
            throw new Error('Insufficient wallet balance.');
        }

        await Wallet.findByIdAndUpdate(
            wallet._id,
            { $inc: { balance: balanceChange } },
            { new: true, session }
        );

        const newTransaction = new Transaction({
            wallet: wallet._id,
            user: userId,
            hospital: hospitalId,
            amount,
            type,
            transactionType,
            description,
            referenceId,
            status: 'Completed'
        });

        return await newTransaction.save({ session });
    };

    if (existingSession) {
        // If a session is passed, we're part of a larger transaction.
        // The caller is responsible for committing/aborting.
        return await performDbOperations(existingSession);
    } else {
        // If no session, create one and manage the transaction here.
        const session = await mongoose.startSession();
        let savedTransaction;
        try {
            await session.withTransaction(async () => {
                savedTransaction = await performDbOperations(session);
            });
            return savedTransaction;
        } catch (error) {
            // Log the error but re-throw it to be handled by the controller
            console.error('Transaction failed and was rolled back:', error.message);
            throw error;
        } finally {
            await session.endSession();
        }
    }
};

module.exports = {
    getOrCreateWallet,
    createTransactionAndUpdateWallet
};