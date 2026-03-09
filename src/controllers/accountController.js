const mongoose = require('mongoose');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');

// @desc    Get all accounts
// @route   GET /api/accounts
// @access  Private
const getAccounts = async (req, res, next) => {
  try {
    const accounts = await Account.find({ user: req.user._id, isArchived: { $ne: true } }).lean();
    res.json({ success: true, accounts });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all archived accounts
// @route   GET /api/accounts/archived
// @access  Private
const getArchivedAccounts = async (req, res, next) => {
  try {
    const accounts = await Account.find({ user: req.user._id, isArchived: true }).lean();
    res.json({ success: true, accounts });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single account
// @route   GET /api/accounts/:id
// @access  Private
const getAccount = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid Account ID' });
    }
    const account = await Account.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    res.json({ success: true, account });
  } catch (error) {
    next(error);
  }
};

// @desc    Create account
// @route   POST /api/accounts
// @access  Private
const createAccount = async (req, res, next) => {
  try {
    const account = await Account.create({ ...req.body, user: req.user._id });
    res.status(201).json({ success: true, message: 'Account created', account });
  } catch (error) {
    next(error);
  }
};

// @desc    Update account
// @route   PUT /api/accounts/:id
// @access  Private
const updateAccount = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid Account ID' });
    }
    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    res.json({ success: true, message: 'Account updated', account });
  } catch (error) {
    next(error);
  }
};

// @desc    Archive account (Soft Delete)
// @route   PUT /api/accounts/:id/archive
// @access  Private
const archiveAccount = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid Account ID' });
    }
    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isArchived: true },
      { new: true }
    );

    if (!account) {
      console.log('❌ Archive failed: Account not found for ID:', req.params.id);
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    console.log('✅ Archive successful for:', account.name);
    res.json({ success: true, message: 'Account archived', account });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete account (Permanent)
// @route   DELETE /api/accounts/:id
// @access  Private
const deleteAccount = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid Account ID' });
    }
    const account = await Account.findOne({ _id: req.params.id, user: req.user._id });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Check if account has transactions
    const transactionCount = await Transaction.countDocuments({ account: req.params.id });
    if (transactionCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete account with existing transactions. Please delete transactions first.',
      });
    }

    await account.deleteOne();
    res.json({ success: true, message: 'Account deleted permanently' });
  } catch (error) {
    next(error);
  }
};

// @desc    Unarchive account
// @route   PUT /api/accounts/:id/unarchive
// @access  Private
const unarchiveAccount = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Invalid Account ID' });
    }
    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isArchived: false },
      { new: true }
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    res.json({ success: true, message: 'Account unarchived', account });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAccounts,
  getAccount,
  getArchivedAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  archiveAccount,
  unarchiveAccount,
};
