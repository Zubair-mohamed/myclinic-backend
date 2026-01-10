const express = require('express');
const router = express.Router();
const Transaction = require('../models/transaction');
const Notification = require('../models/notification');
const RedeemCode = require('../models/redeemCode');
const Wallet = require('../models/wallet');
const { protect, authorize } = require('../middleware/auth');
const walletService = require('../services/walletService');
const { createNotification } = require('../utils/notificationHelper');

// All routes are protected for logged-in users
router.use(protect);

// @desc    Get current user's wallet
// @route   GET /api/wallet
// @access  Private (Patient)
router.get('/', authorize('patient'), async (req, res) => {
    try {
        const wallet = await walletService.getOrCreateWallet(req.user._id);
        res.json(wallet);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Server Error' });
    }
});

// @desc    Get wallet transactions for the current user
// @route   GET /api/wallet/transactions
// @access  Private (Patient)
router.get('/transactions', authorize('patient'), async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Add funds via deposit
// @route   POST /api/wallet/deposit
// @access  Private (patient only)
router.post('/deposit', authorize('patient'), async (req, res) => {
    try {
        const { amount } = req.body;
        const parsedAmount = parseFloat(amount);

        if (!parsedAmount || parsedAmount <= 0) {
            return res.status(400).json({ error: 'Please provide a valid positive amount.' });
        }
        
        // Use wallet service to handle transaction and balance update
        const transactionData = {
            userId: req.user._id,
            amount: parsedAmount,
            type: 'credit',
            transactionType: 'Deposit',
            description: `User deposit via portal.`,
            referenceId: `DEPOSIT_${Date.now()}` // Simple unique reference
        };

        await walletService.createTransactionAndUpdateWallet(transactionData);
        
        // Create notification (in-app + external)
        await createNotification(
            req.user._id,
            'wallet',
            {
                en: `Your wallet has been credited with ${parsedAmount.toFixed(2)} LYD.`,
                ar: `تم إيداع ${parsedAmount.toFixed(2)} دينار في محفظتك.`
            },
            {
                title: {
                    en: 'Wallet Credited',
                    ar: 'تم شحن المحفظة'
                },
                language: 'ar',
                data: {
                    amount: parsedAmount.toFixed(2),
                    link: `#/wallet`
                }
            }
        );

        res.status(200).json({ success: true, amount: parsedAmount });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Server Error' });
    }
});

// @desc    Redeem a code to add funds to wallet
// @route   POST /api/wallet/redeem-code
// @access  Private (patient only)
router.post('/redeem-code', authorize('patient'), async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Please provide a code.' });
        }

        const redeemCode = await RedeemCode.findOne({ code: code.toUpperCase() });

        if (!redeemCode) {
            return res.status(404).json({ error: 'Invalid code.' });
        }
        if (redeemCode.isUsed) {
            return res.status(400).json({ error: 'This code has already been used.' });
        }
        
        // Use wallet service to handle transaction and balance update
        const transactionData = {
            userId: req.user._id,
            amount: redeemCode.amount,
            type: 'credit',
            transactionType: 'Deposit',
            description: `Redeemed code: ${redeemCode.code}`,
            referenceId: redeemCode._id.toString()
        };

        await walletService.createTransactionAndUpdateWallet(transactionData);
        
        // Mark code as used
        redeemCode.isUsed = true;
        redeemCode.usedBy = req.user._id;
        redeemCode.usedAt = new Date();
        await redeemCode.save();

        // Create notification (in-app + external)
        await createNotification(
            req.user._id,
            'wallet',
            {
                en: `Your wallet has been credited with ${redeemCode.amount.toFixed(2)} LYD.`,
                ar: `تم إيداع ${redeemCode.amount.toFixed(2)} دينار في محفظتك.`
            },
            {
                title: {
                    en: 'Wallet Credited',
                    ar: 'تم شحن المحفظة'
                },
                language: 'ar',
                data: {
                    amount: redeemCode.amount.toFixed(2),
                    link: `#/wallet`
                }
            }
        );

        res.status(200).json({ success: true, amount: redeemCode.amount });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Server Error' });
    }
});

module.exports = router;