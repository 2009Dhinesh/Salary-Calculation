const mongoose = require('mongoose');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { getSharedAccountsInfo, checkAccountAccess } = require('../utils/permissionHelper');

// Helper to normalize account object (handle legacy misspelled keys)
const normalizeAccount = (acc) => {
  if (!acc) return acc;
  
  // Collect all people from all possible typo fields
  const typoKeys = ['otherPersonss', 'otherrPersons', 'otherPersons:', 'otherrPersonss'];
  let mergedOthers = Array.isArray(acc.otherPersons) ? [...acc.otherPersons] : [];
  
  for (const key of typoKeys) {
    if (Array.isArray(acc[key]) && acc[key].length > 0) {
      // Add items that are not already in the list (by name or ID)
      for (const person of acc[key]) {
        const exists = mergedOthers.some(p => 
          (p._id && person._id && p._id.toString() === person._id.toString()) || 
          (p.name === person.name)
        );
        if (!exists) mergedOthers.push(person);
      }
    }
  }
  
  acc.otherPersons = mergedOthers;
  return acc;
};

// @desc    Get all accounts
// @route   GET /api/accounts
// @access  Private
const getAccounts = async (req, res, next) => {
  try {
    const rawAccounts = await Account.find({ user: req.user._id, isArchived: { $ne: true } }).lean();
    const accounts = rawAccounts.map(acc => ({ ...normalizeAccount(acc), isShared: false, canEdit: true }));

    // Fetch shared accounts
    const sharedInfo = await getSharedAccountsInfo(req.user._id);
    if (sharedInfo.length > 0) {
      const sharedAccountIds = sharedInfo.map(info => info.accountId);
      const rawSharedAccounts = await Account.find({ _id: { $in: sharedAccountIds }, isArchived: { $ne: true } }).lean();
      
      const sharedAccounts = rawSharedAccounts.map(acc => {
        const info = sharedInfo.find(i => i.accountId === acc._id.toString());
        return {
          ...normalizeAccount(acc),
          isShared: true,
          canEdit: info.canEdit,
          ownerName: info.ownerName
        };
      });
      accounts.push(...sharedAccounts);
    }

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
    const rawAccounts = await Account.find({ user: req.user._id, isArchived: true }).lean();
    const accounts = rawAccounts.map(normalizeAccount);
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

    const { allowed, account: rawAccount, status, message, canEdit, ownerName } = await checkAccountAccess(req.user._id, req.params.id, 'view');
    
    if (!allowed) {
      return res.status(status || 403).json({ success: false, message: message || 'Account not found' });
    }

    const account = { 
      ...normalizeAccount(rawAccount.toObject ? rawAccount.toObject() : rawAccount), 
      isShared: rawAccount.user.toString() !== req.user._id.toString(),
      canEdit,
      ownerName
    };

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
    const accountData = { ...req.body, user: req.user._id };
    
    // Initialize targetAmount for new persons
    if (accountData.otherPersons && Array.isArray(accountData.otherPersons)) {
      accountData.otherPersons = accountData.otherPersons.map(p => ({
        ...p,
        targetAmount: p.amount || 0 // Initial target is the initial amount
      }));
    }

    const account = await Account.create(accountData);
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

    const updateData = { ...req.body };

    // When explicitly updating the account (e.g. from settings),
    // we assume the user is resetting/defining the new expected balance for persons.
    // So we sync targetAmount with the new amount if provided.
    // Note: If they are just renaming a person, we shouldn't overwrite targetAmount if amount wasn't changed
    // But since the frontend sends the full array, we just ensure targetAmount exists and defaults to amount if missing.
    // To be safer, we fetch the existing account first to preserve targetAmounts if we only changed the name, 
    // but the simplest robust way for this app is to update targetAmount if the user is in "Edit Account" mode.
    const existingAccount = await Account.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingAccount) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (updateData.otherPersons && Array.isArray(updateData.otherPersons)) {
      updateData.otherPersons = updateData.otherPersons.map(incomingP => {
        const existingP = existingAccount.otherPersons.find(ep => ep.name === incomingP.name);
        
        // If the user changed the amount manually in the settings, update the target.
        // If the amount is the same as before, keep the old target (it might be actively tracking a borrowed state).
        // If it's a completely new person, target = amount.
        let newTarget = incomingP.amount; 
        
        if (existingP && existingP.amount === incomingP.amount) {
           newTarget = existingP.targetAmount !== undefined ? existingP.targetAmount : incomingP.amount;
        }

        return {
          ...incomingP,
          targetAmount: newTarget
        };
      });
    }

    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateData,
      { new: true, runValidators: true }
    );

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
    
    console.log(`[Archive] Attempting to archive account: ${req.params.id} for user: ${req.user._id}`);
    
    const account = await Account.findOne({ _id: req.params.id, user: req.user._id });

    if (!account) {
      console.log('❌ [Archive] Failed: Account not found for ID:', req.params.id);
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Set archived flag
    account.isArchived = true;
    
    // Explicitly save to ensure schema fields are processed
    const savedAccount = await account.save();

    console.log(`✅ [Archive] Successful for: ${savedAccount.name}. isArchived is now: ${savedAccount.isArchived}`);
    res.json({ success: true, message: 'Account archived', account: savedAccount });
  } catch (error) {
    console.error('❌ [Archive] Server Error:', error);
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
