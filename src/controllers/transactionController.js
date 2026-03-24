const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Account = require('../models/Account');
const Category = require('../models/Category');
const User = require('../models/User');
const { checkAccountThresholds } = require('../utils/alertHelper');
const { getSharedAccountsInfo, checkAccountAccess } = require('../utils/permissionHelper');
const cache = require('../utils/cache');

/**
 * Helper to update account balance
 * @param {string|object} accountIdOrObject - Account ID or Mongoose Document
 */
const updateAccountBalance = async (accountIdOrObject, amount, type, operation = 'add', toAccountId = null, otherPersonId = null, isBorrowing = false) => {
  let replenishments = [];
  const numAmount = Number(amount);

  // 1. Resolve primary account
  let account;
  if (accountIdOrObject && typeof accountIdOrObject.save === 'function') {
    account = accountIdOrObject;
  } else {
    account = await Account.findById(accountIdOrObject);
  }

  if (!account) return replenishments;

  let change = 0;
  if (type === 'income') change = numAmount;
  else if (type === 'expense' || type === 'transfer') change = -numAmount;

  if (operation === 'add') {
    if ((type === 'expense' || type === 'transfer') && account.balance + change < 0) {
      const error = new Error('Insufficient account balance');
      error.status = 400;
      throw error;
    }
    account.balance += change;
  } else if (operation === 'remove') {
    account.balance -= change;
  }

  let incomeRemainingToDistribute = type === 'income' ? numAmount : 0;
  
  // Auto-Replenish on income
  if (operation === 'add' && type === 'income' && account.otherPersons?.length > 0) {
    for (let p of account.otherPersons) {
      const shortfall = (p.targetAmount || p.amount) - p.amount;
      if (shortfall > 0 && incomeRemainingToDistribute > 0) {
        const amountToReplenish = Math.min(shortfall, incomeRemainingToDistribute);
        p.amount += amountToReplenish;
        incomeRemainingToDistribute -= amountToReplenish;
        replenishments.push({ personName: p.name, amount: amountToReplenish });
      }
    }
  }

  // Handle Third Party Person Amount Update
  if (otherPersonId && (type === 'income' || type === 'expense')) {
    const person = account.otherPersons?.id(otherPersonId) || 
                   account.otherPersons?.find(p => p.name === otherPersonId);
                   
    if (person) {
      if (operation === 'add') {
        if (type === 'income') {
          person.amount += incomeRemainingToDistribute; 
          if (person.targetAmount === undefined) person.targetAmount = person.amount - incomeRemainingToDistribute;
          person.targetAmount += incomeRemainingToDistribute;
        } else if (type === 'expense') {
          if (isBorrowing) {
            const currentOtherTotal = account.otherPersons.reduce((s, p) => s + p.amount, 0);
            const balanceBeforeTxn = account.balance - change; 
            const userMoneyBefore = balanceBeforeTxn - currentOtherTotal;
            const shortfall = numAmount - userMoneyBefore;
            if (shortfall > 0) {
              const deductionFromPerson = Math.min(person.amount, shortfall);
              person.amount -= deductionFromPerson;
            }
          } else {
            person.amount -= numAmount;
          }
        }
      } else if (operation === 'remove') {
        if (type === 'income') person.amount = Math.max(0, person.amount - numAmount);
        else if (type === 'expense') person.amount += numAmount;
      }
    }
  }
  
  await account.save();

  // 2. Handle destination account for transfers
  if (type === 'transfer' && toAccountId) {
    const toAccount = await Account.findById(toAccountId);
    if (toAccount) {
      if (operation === 'add') toAccount.balance += numAmount;
      else if (operation === 'remove') toAccount.balance -= numAmount;
      
      if (otherPersonId) {
        const sourcePerson = account.otherPersons?.id(otherPersonId) || 
                             account.otherPersons?.find(p => p.name === otherPersonId);
        
        if (sourcePerson) {
          let targetPerson = toAccount.otherPersons.find(p => p.name === sourcePerson.name);
          if (!targetPerson) {
            toAccount.otherPersons.push({
              name: sourcePerson.name,
              amount: 0,
              targetAmount: sourcePerson.targetAmount || 0
            });
            targetPerson = toAccount.otherPersons[toAccount.otherPersons.length - 1];
          }

          if (operation === 'add') {
            targetPerson.amount += numAmount;
            if (targetPerson.targetAmount < targetPerson.amount) targetPerson.targetAmount = targetPerson.amount;
          } else if (operation === 'remove') {
            targetPerson.amount = Math.max(0, targetPerson.amount - numAmount);
          }
        }
      }
      await toAccount.save();
    }
  }

  return replenishments;
};

const calculateNextOccurrence = (date, frequency) => {
  const next = new Date(date);
  switch (frequency) {
    case 'daily': next.setDate(next.getDate() + 1); break;
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
    default: return null;
  }
  return next;
};

// @desc    Get all transactions with filters
const getTransactions = async (req, res, next) => {
  try {
    const {
      type, category, account, startDate, endDate, search,
      page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc',
    } = req.query;

    const query = { user: req.user._id };
    if (type) query.type = type;
    if (category) query.category = category;
    if (account) query.account = account;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (search) {
      query.$or = [{ title: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    if (sortBy === 'date') sort.createdAt = -1;

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('category', 'name icon color type')
        .populate('account', 'name icon color bankName bankLogo isArchived')
        .populate('paymentMethod', 'name icon color')
        .select('title amount type date category account paymentMethod otherPersonId isBorrowing')
        .sort(sort).skip(skip).limit(parseInt(limit)).lean(),
      Transaction.countDocuments(query),
    ]);

    res.json({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) { next(error); }
};

// @desc    Get single transaction
const getTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, user: req.user._id })
      .populate('category', 'name icon color type')
      .populate('account', 'name type icon color bankName bankLogo isArchived').lean();

    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, transaction });
  } catch (error) { next(error); }
};

// @desc    Create transaction
const createTransaction = async (req, res, next) => {
  try {
    const { amount, type, account: accountId, toAccount, isRecurring, frequency, date } = req.body;
    
    // Check permission
    const { allowed, status, message, canEdit } = await checkAccountAccess(req.user._id, accountId, 'edit');
    
    if (!allowed) return res.status(status || 403).json({ success: false, message: message || 'No write access to this account' });

    const nextOccurrence = isRecurring ? calculateNextOccurrence(date || Date.now(), frequency) : null;

    const transaction = await Transaction.create({ ...req.body, user: req.user._id, nextOccurrence });

    const replenishments = await updateAccountBalance(accountId, amount, type, 'add', toAccount, req.body.otherPersonId, req.body.isBorrowing);
    if (type === 'income' && replenishments?.length > 0) {
      transaction.autoReplenishments = replenishments;
      await transaction.save();
    }

    const budgetMessage = type === 'expense' ? await checkAccountThresholds(req.user._id, accountId, amount, date || Date.now()) : null;
    await transaction.populate([
      { path: 'category', select: 'name icon color type' },
      { path: 'account', select: 'name type icon color bankName bankLogo otherPersons monthlyLimit balance' },
      { path: 'paymentMethod', select: 'name icon color' }
    ]);

    res.status(201).json({ success: true, message: 'Transaction added', transaction, budgetMessage });

    // Cache Invalidation
    await cache.delPattern(`summary:${req.user._id}:*`);
    await Promise.all([cache.del(`insights:${req.user._id}`), cache.del(`wealth:${req.user._id}`)]);
  } catch (error) { next(error); }
};

// @desc    Update transaction
const updateTransaction = async (req, res, next) => {
  try {
    const oldTransaction = await Transaction.findOne({ _id: req.params.id, user: req.user._id });
    if (!oldTransaction) return res.status(404).json({ success: false, message: 'Transaction not found' });

    // Check permission for the account
    const { allowed, status, message } = await checkAccountAccess(req.user._id, oldTransaction.account, 'edit');
    if (!allowed) return res.status(status || 403).json({ success: false, message: message || 'No write access to this account' });

    await updateAccountBalance(oldTransaction.account, oldTransaction.amount, oldTransaction.type, 'remove', oldTransaction.toAccount, oldTransaction.otherPersonId, oldTransaction.isBorrowing);

    const { isRecurring, frequency, date } = req.body;
    const nextOccurrence = isRecurring ? calculateNextOccurrence(date || oldTransaction.date, frequency) : null;

    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { ...req.body, nextOccurrence },
      { new: true, runValidators: true }
    ).populate('category', 'name icon color type').populate('account', 'name type icon color bankName bankLogo otherPersons balance').populate('paymentMethod', 'name icon color');

    const replenishments = await updateAccountBalance(transaction.account._id, transaction.amount, transaction.type, 'add', transaction.toAccount, transaction.otherPersonId, transaction.isBorrowing);
    if (transaction.type === 'income') {
      transaction.autoReplenishments = replenishments || [];
      await transaction.save();
    }

    res.json({ success: true, message: 'Transaction updated', transaction });

    // Cache Invalidation
    await cache.delPattern(`summary:${req.user._id}:*`);
    await Promise.all([cache.del(`insights:${req.user._id}`), cache.del(`wealth:${req.user._id}`)]);
  } catch (error) { next(error); }
};

// @desc    Delete transaction
const deleteTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, user: req.user._id });
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });

    // Check permission for the account
    const { allowed, status, message } = await checkAccountAccess(req.user._id, transaction.account, 'edit');
    if (!allowed) return res.status(status || 403).json({ success: false, message: message || 'No write access to this account' });

    await updateAccountBalance(transaction.account, transaction.amount, transaction.type, 'remove', transaction.toAccount, transaction.otherPersonId, transaction.isBorrowing);
    await transaction.deleteOne();

    res.json({ success: true, message: 'Transaction deleted' });

    // Cache Invalidation
    await cache.delPattern(`summary:${req.user._id}:*`);
    await Promise.all([cache.del(`insights:${req.user._id}`), cache.del(`wealth:${req.user._id}`)]);
  } catch (error) { next(error); }
};

// @desc    Get dashboard summary
const getSummary = async (req, res, next) => {
  try {
    const { month, year, date, account: accountId } = req.query;
    const userId = req.user._id;
    
    const cacheKey = `summary:${userId}:${month || 'now'}:${year || 'now'}:${date || 'none'}:${accountId || 'all'}`;
    const cachedData = await cache.get(cacheKey);
    if (cachedData) return res.json({ success: true, summary: cachedData, fromCache: true });

    const currentDate = new Date();
    let startDate, endDate;

    if (date) {
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    } else if (month) {
      const targetMonth = parseInt(month);
      const targetYear = parseInt(year) || currentDate.getFullYear();
      startDate = new Date(targetYear, targetMonth - 1, 1);
      endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    } else if (year) {
      const targetYear = parseInt(year);
      startDate = new Date(targetYear, 0, 1);
      endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);
    } else {
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const activeAccounts = await Account.find({ user: userId, isArchived: { $ne: true } }).lean();
    
    // Include shared accounts
    const sharedInfo = await getSharedAccountsInfo(userId);
    if (sharedInfo.length > 0) {
      const sharedAccountIds = sharedInfo.map(info => info.accountId);
      const sharedAccounts = await Account.find({ _id: { $in: sharedAccountIds }, isArchived: { $ne: true } }).lean();
      
      const normalizedShared = sharedAccounts.map(acc => {
        const info = sharedInfo.find(i => i.accountId === acc._id.toString());
        return {
          ...acc,
          isShared: true,
          canEdit: info.canEdit,
          ownerName: info.ownerName
        };
      });
      activeAccounts.push(...normalizedShared);
    }
    
    const activeAccountIds = activeAccounts.map(a => a._id);

    const matchCriteria = {
      // For shared accounts, we might want to see transactions created by US or all transactions?
      // Usually, if I can view an account, I want to see the account's total flow.
      // But the current query filters by user: userId.
      // If it's a shared account, we should also include transactions of that account owner.
      $or: [
        { user: userId },
        { account: { $in: activeAccountIds } }
      ],
      date: { $gte: startDate, $lte: endDate },
      $or: [{ account: { $in: activeAccountIds } }, { toAccount: { $in: activeAccountIds } }]
    };

    if (accountId) matchCriteria.$or = [{ account: accountId }, { toAccount: accountId }];

    const totalsAgg = await Transaction.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          income: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'income'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$toAccount', accountId ? { $toObjectId: accountId } : null] }] }]}, '$amount', 0] } },
          expense: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'expense'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$account', accountId ? { $toObjectId: accountId } : null] }] }]}, '$amount', 0] } },
          incomeCount: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'income'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$toAccount', accountId ? { $toObjectId: accountId } : null] }] }]}, 1, 0] } },
          expenseCount: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'expense'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$account', accountId ? { $toObjectId: accountId } : null] }] }]}, 1, 0] } },
        }
      }
    ]);

    const stats = totalsAgg[0] || { income: 0, expense: 0, incomeCount: 0, expenseCount: 0 };
    const totalBalance = activeAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
    const otherPersonsTotal = activeAccounts.reduce((sum, acc) => sum + (acc.otherPersons || []).reduce((s, p) => s + Math.max(0, Number(p.amount) || 0), 0), 0);

    let accountDetails = null;
    let previousBalance = 0;
    
    if (accountId) {
      accountDetails = activeAccounts.find(a => a._id.toString() === accountId);
      if (accountDetails) {
        const afterRangeAgg = await Transaction.aggregate([
          { $match: { user: userId, date: { $gt: endDate }, $or: [{ account: accountId }, { toAccount: accountId }] } },
          { $group: { _id: null, income: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'income'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$toAccount', { $toObjectId: accountId }] }] }]}, '$amount', 0] } }, expense: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'expense'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$account', { $toObjectId: accountId }] }] }]}, '$amount', 0] } } } }
        ]);
        const afterStats = afterRangeAgg[0] || { income: 0, expense: 0 };
        previousBalance = accountDetails.balance - (afterStats.income - afterStats.expense) - (stats.income - stats.expense);
      }
    } else {
      const afterRangeAgg = await Transaction.aggregate([
        { $match: { user: userId, date: { $gt: endDate }, type: { $in: ['income', 'expense'] } } },
        { $group: { _id: null, income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } }, expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } } } }
      ]);
      const afterStats = afterRangeAgg[0] || { income: 0, expense: 0 };
      previousBalance = totalBalance - (afterStats.income - afterStats.expense) - (stats.income - stats.expense);
    }

    const categoryAgg = await Transaction.aggregate([
      { $match: { ...matchCriteria, type: 'expense' } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);
    await Category.populate(categoryAgg, { path: '_id', select: 'name icon color' });

    const recentTxnQuery = { user: userId, $or: [{ account: { $in: activeAccountIds } }, { toAccount: { $in: activeAccountIds } }] };
    const [recentTransactions, firstTransaction] = await Promise.all([
      Transaction.find(recentTxnQuery)
        .populate('category', 'name icon color type')
        .populate('account', 'name icon color bankName bankLogo isArchived')
        .select('title amount type date category account otherPersonId')
        .sort({ date: -1, createdAt: -1 })
        .limit(5)
        .lean(),
      Transaction.findOne({ user: userId }).sort({ date: 1 }).select('date').lean()
    ]);

    const summary = {
      balance: accountDetails ? accountDetails.balance : totalBalance,
      otherPersonsTotal, previousBalance, totalIncome: stats.income, totalExpense: stats.expense,
      incomeCount: stats.incomeCount, expenseCount: stats.expenseCount,
      monthly: { income: stats.income, expense: stats.expense, incomeCount: stats.incomeCount, expenseCount: stats.expenseCount },
      categoryBreakdown: categoryAgg.map(i => ({ category: i._id, total: i.total, count: i.count })),
      recentTransactions, accounts: accountDetails ? [accountDetails] : activeAccounts,
      firstTransactionDate: firstTransaction?.date || null,
    };

    await cache.set(cacheKey, summary, 600);
    res.json({ success: true, summary });
  } catch (error) { next(error); }
};

// @desc    Get monthly report data
const getReport = async (req, res, next) => {
  try {
    const targetYear = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = new Date(targetYear, 0, 1), endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    const monthlyData = await Transaction.aggregate([
      { $match: { user: req.user._id, date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { month: { $month: '$date' }, type: '$type' }, total: { $sum: '$amount' } } },
      { $sort: { '_id.month': 1 } },
    ]);

    const report = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, expense: 0 }));
    monthlyData.forEach(({ _id, total }) => { report[_id.month - 1][_id.type] = total; });

    res.json({ success: true, report });
  } catch (error) { next(error); }
};

module.exports = { getTransactions, getTransaction, createTransaction, updateTransaction, deleteTransaction, getSummary, getReport };
