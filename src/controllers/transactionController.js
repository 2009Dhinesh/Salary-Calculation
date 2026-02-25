const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Account = require('../models/Account');
const User = require('../models/User');

// Helper to update account balance
const updateAccountBalance = async (accountId, amount, type, operation = 'add', toAccountId = null) => {
  // 1. Handle primary account
  const account = await Account.findById(accountId);
  if (account) {
    let change = 0;
    if (type === 'income') {
      change = amount;
    } else if (type === 'expense' || type === 'transfer') {
      change = -amount;
    }

    if (operation === 'add') account.balance += change;
    else if (operation === 'remove') account.balance -= change;

    await account.save();
  }

  // 2. Handle destination account for transfers
  if (type === 'transfer' && toAccountId) {
    const toAccount = await Account.findById(toAccountId);
    if (toAccount) {
      if (operation === 'add') toAccount.balance += amount;
      else if (operation === 'remove') toAccount.balance -= amount;
      await toAccount.save();
    }
  }
};

// Helper to calculate next occurrence for recurring
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
// @route   GET /api/transactions
// @access  Private
const getTransactions = async (req, res, next) => {
  try {
    const {
      type,
      category,
      account,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'desc',
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
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    
    // Add secondary sort for exact arrival ordering when dates are identical
    if (sortBy === 'date') {
      sort.createdAt = -1;
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('category', 'name icon color type')
        .populate('account', 'name type icon color bankName bankLogo')
        .populate('paymentMethod', 'name icon color')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
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
  } catch (error) {
    next(error);
  }
};

// @desc    Get single transaction
// @route   GET /api/transactions/:id
// @access  Private
const getTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id,
    })
    .populate('category', 'name icon color type')
    .populate('account', 'name type icon color bankName bankLogo');

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.json({ success: true, transaction });
  } catch (error) {
    next(error);
  }
};

// @desc    Create transaction
// @route   POST /api/transactions
// @access  Private
const createTransaction = async (req, res, next) => {
  try {
    const { amount, type, account, toAccount, isRecurring, frequency, date } = req.body;

    const nextOccurrence = isRecurring ? calculateNextOccurrence(date || Date.now(), frequency) : null;

    const transaction = await Transaction.create({
      ...req.body,
      user: req.user._id,
      nextOccurrence
    });

    // Update account balance
    await updateAccountBalance(account, amount, type, 'add', toAccount);

    await transaction.populate('category', 'name icon color type');
    await transaction.populate('account', 'name type icon color bankName bankLogo');
    await transaction.populate('paymentMethod', 'name icon color');

    res.status(201).json({ success: true, message: 'Transaction added', transaction });
  } catch (error) {
    next(error);
  }
};

// @desc    Update transaction
// @route   PUT /api/transactions/:id
// @access  Private
const updateTransaction = async (req, res, next) => {
  try {
    const oldTransaction = await Transaction.findOne({ _id: req.params.id, user: req.user._id });
    if (!oldTransaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // 1. Revert old balance impact
    await updateAccountBalance(oldTransaction.account, oldTransaction.amount, oldTransaction.type, 'remove', oldTransaction.toAccount);

    // 2. Update transaction
    const { isRecurring, frequency, date } = req.body;
    const nextOccurrence = isRecurring ? calculateNextOccurrence(date || oldTransaction.date, frequency) : null;

    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { ...req.body, nextOccurrence },
      { new: true, runValidators: true }
    ).populate('category', 'name icon color type').populate('account', 'name type icon color bankName bankLogo').populate('paymentMethod', 'name icon color');

    // 3. Apply new balance impact
    await updateAccountBalance(transaction.account, transaction.amount, transaction.type, 'add', transaction.toAccount);

    res.json({ success: true, message: 'Transaction updated', transaction });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete transaction
// @route   DELETE /api/transactions/:id
// @access  Private
const deleteTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Revert balance impact before deleting
    await updateAccountBalance(transaction.account, transaction.amount, transaction.type, 'remove', transaction.toAccount);

    await transaction.deleteOne();

    res.json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard summary
// @route   GET /api/transactions/summary
// @access  Private
const getSummary = async (req, res, next) => {
  try {
    const { month, year, date } = req.query;
    const currentDate = new Date();
    let startDate, endDate;

    if (date) {
      // Daily analysis
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    } else if (month) {
      // Monthly analysis
      const targetMonth = parseInt(month);
      const targetYear = parseInt(year) || currentDate.getFullYear();
      startDate = new Date(targetYear, targetMonth - 1, 1);
      endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    } else if (year) {
      // Yearly analysis
      const targetYear = parseInt(year);
      startDate = new Date(targetYear, 0, 1);
      endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);
    } else {
      // Default to current month
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Monthly aggregation
    const monthlyAgg = await Transaction.aggregate([
      {
        $match: {
          user: req.user._id,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Total balances from Accounts
    const accounts = await Account.find({ user: req.user._id });
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    // Category-wise for the month
    const categoryAgg = await Transaction.aggregate([
      {
        $match: {
          user: req.user._id,
          type: 'expense',
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    await Transaction.populate(categoryAgg, { path: '_id', select: 'name icon color', model: 'Category' });

    // Recent transactions
    const recentTransactions = await Transaction.find({ user: req.user._id })
      .populate('category', 'name icon color type')
      .populate('account', 'name icon color bankName bankLogo')
      .sort({ date: -1, createdAt: -1 })
      .limit(5);

    // Find the very first transaction date to calculate total saving duration
    const firstTransaction = await Transaction.findOne({ user: req.user._id })
      .sort({ date: 1 })
      .select('date');

    const monthly = {};
    monthlyAgg.forEach((item) => {
      monthly[item._id] = { total: item.total, count: item.count };
    });

    res.json({
      success: true,
      summary: {
        balance: totalBalance,
        totalIncome: monthly.income?.total || 0,
        totalExpense: monthly.expense?.total || 0,
        incomeCount: monthly.income?.count || 0,
        expenseCount: monthly.expense?.count || 0,
        monthly: {
          income: monthly.income?.total || 0,
          expense: monthly.expense?.total || 0,
          incomeCount: monthly.income?.count || 0,
          expenseCount: monthly.expense?.count || 0,
        },
        categoryBreakdown: categoryAgg.map((item) => ({
          category: item._id,
          total: item.total,
          count: item.count,
        })),
        recentTransactions,
        accounts,
        firstTransactionDate: firstTransaction ? firstTransaction.date : null,
        userCreatedAt: req.user.createdAt
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get monthly report data
// @route   GET /api/transactions/report
// @access  Private
const getReport = async (req, res, next) => {
  try {
    const { year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();

    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    const monthlyData = await Transaction.aggregate([
      {
        $match: {
          user: req.user._id,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { month: { $month: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]);

    // Build 12-month chart data
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      income: 0,
      expense: 0,
    }));

    monthlyData.forEach(({ _id, total }) => {
      const idx = _id.month - 1;
      months[idx][_id.type] = total;
    });

    res.json({ success: true, report: months });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getSummary,
  getReport,
};
