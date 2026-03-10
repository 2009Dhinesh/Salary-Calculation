const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Account = require('../models/Account');
const User = require('../models/User');
const { checkAccountThresholds } = require('../utils/alertHelper');

// Helper to update account balance
const updateAccountBalance = async (accountId, amount, type, operation = 'add', toAccountId = null, otherPersonId = null) => {
  let replenishments = []; // Track who got replenished and how much
  
  // Ensure amount is a number
  const numAmount = Number(amount);

  // 1. Handle primary account
  const account = await Account.findById(accountId);
  if (account) {
    let change = 0;
    if (type === 'income') {
      change = numAmount;
    } else if (type === 'expense' || type === 'transfer') {
      change = -numAmount;
    }

    if (operation === 'add') account.balance += change;
    else if (operation === 'remove') account.balance -= change;

    // ─────────────────────────────────────────────────────────────
    // GLOBAL AUTO-REPLENISH LOGIC (Applicable to any income)
    // Whenever income comes into this account, check if any person is short
    // of their targetAmount and replenish them first.
    // ─────────────────────────────────────────────────────────────
    let incomeRemainingToDistribute = type === 'income' ? numAmount : 0;
    
    // We only Auto-Replenish on 'add', but we MUST also check if this transaction IS an income.
    if (operation === 'add' && type === 'income' && account.otherPersons && account.otherPersons.length > 0) {
      for (let i = 0; i < account.otherPersons.length; i++) {
        let p = account.otherPersons[i];
        if (p.targetAmount === undefined) p.targetAmount = p.amount;
        
        const shortfall = p.targetAmount - p.amount;
        if (shortfall > 0 && incomeRemainingToDistribute > 0) {
          const amountToReplenish = Math.min(shortfall, incomeRemainingToDistribute);
          p.amount += amountToReplenish;
          incomeRemainingToDistribute -= amountToReplenish;
          
          replenishments.push({ personName: p.name, amount: amountToReplenish });
          console.log(`🔄 Global Auto-Replenished Person ${p.name}: +${amountToReplenish}`);
        }
      }
    }

    // Handle Third Party Person Amount Update (Explicit Selection)
    if (otherPersonId && (type === 'income' || type === 'expense')) {
      // 1. Check for legacy typos and MIGRATE them if found (MERGE ALL)
      const typoKeys = ['otherPersonss', 'otherrPersons', 'otherPersons:', 'otherrPersonss'];
      let migrationHappened = false;

      for (const key of typoKeys) {
        const typoData = account.get(key);
        if (Array.isArray(typoData) && typoData.length > 0) {
          console.log(`🧹 Merging legacy field '${key}' to 'otherPersons' for account ${account.name}`);
          
          // Merge items into otherPersons
          if (!account.otherPersons) account.otherPersons = [];
          
          for (const person of typoData) {
            const exists = account.otherPersons.some(p => 
              (p._id && person._id && p._id.toString() === person._id.toString()) || 
              (p.name === person.name)
            );
            if (!exists) account.otherPersons.push(person);
          }
          
          // Clear the typo field
          account.set(key, undefined);
          migrationHappened = true;
        }
      }

      if (migrationHappened) {
        account.markModified('otherPersons');
      }

      // ─────────────────────────────────────────────────────────────
      // EXPLICIT PERSON SELECTION LOGIC
      // If the user explicitly selected a person for this transaction
      // ─────────────────────────────────────────────────────────────
      if (otherPersonId) {
        // Fallback to name if ID lookup fails (useful during migration)
        const person = account.otherPersons?.id(otherPersonId) || 
                       account.otherPersons?.find(p => p.name === otherPersonId);
                       
        if (person) {
          const oldVal = person.amount;
          
          if (operation === 'add') {
            if (type === 'income') {
              // If we already distributed some of this income globally, only give them the remainder
              person.amount += incomeRemainingToDistribute; 
              // Since they are explicitly receiving income, their "baseline" (target) increases
              if (person.targetAmount === undefined) person.targetAmount = person.amount - incomeRemainingToDistribute;
              person.targetAmount += incomeRemainingToDistribute;
            } else if (type === 'expense') {
              // USER-FIRST LOGIC: Use user's money first, take only shortfall from person.
              // 1. Calculate how much of the OLD balance belonged to the user
              const currentOtherTotal = account.otherPersons.reduce((s, p) => s + p.amount, 0);
              const balanceBeforeTxn = account.balance - change; // change is negative for expense
              const userMoneyBefore = balanceBeforeTxn - currentOtherTotal;
              
              // 2. Determine how much we need from the person
              const shortfall = numAmount - userMoneyBefore;
              
              if (shortfall > 0) {
                // We need some or all of the person's money
                const deductionFromPerson = Math.min(person.amount, shortfall);
                person.amount -= deductionFromPerson;
              }
              // If shortfall <= 0, we don't subtract anything from person.amount
            }
          } else if (operation === 'remove') {
            // Reverting a transaction
            if (type === 'income') {
               // Removing an income that was added to a person
               person.amount = Math.max(0, person.amount - numAmount);
            } else if (type === 'expense') {
               // Removing an expense that was taken from a person
               // Note: Since we capped it during 'add', reverting is an estimate
               // but adding back the full amount is generally safe as it restores their "limit".
               person.amount += numAmount;
            }
          }
          
          console.log(`👤 Person ${person.name} amount update: ${oldVal} -> ${person.amount} (Type: ${type}, Op: ${operation}, Amt: ${numAmount})`);
        } else {
          console.log(`⚠️ Person with ID/Name ${otherPersonId} not found in account ${account.name}`);
        }
      }

    } // end of `if (otherPersonId || type === 'income' || ...)` block from upper levels
    
    // (A broader wrapper existed that checked if we even need to touch otherPersons. Let's ensure save happens)
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

  return replenishments;
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
        .populate('account', 'name type icon color bankName bankLogo isArchived otherPersons')
        .populate('paymentMethod', 'name icon color')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
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
    .populate('account', 'name type icon color bankName bankLogo isArchived')
    .lean();

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
    const { amount, type, account: accountId, toAccount, isRecurring, frequency, date } = req.body;

    const nextOccurrence = isRecurring ? calculateNextOccurrence(date || Date.now(), frequency) : null;

    const transaction = await Transaction.create({
      ...req.body,
      user: req.user._id,
      nextOccurrence
    });

    // Update account balance
    const replenishments = await updateAccountBalance(accountId, amount, type, 'add', toAccount, req.body.otherPersonId);

    if (type === 'income' && replenishments && replenishments.length > 0) {
      transaction.autoReplenishments = replenishments;
      await transaction.save();
    }

    // BUDGET ALERT LOGIC
    const budgetMessage = type === 'expense' ? await checkAccountThresholds(req.user._id, accountId, amount, date || Date.now()) : null;


    await transaction.populate('category', 'name icon color type');
    await transaction.populate('account', 'name type icon color bankName bankLogo otherPersons monthlyLimit');
    await transaction.populate('paymentMethod', 'name icon color');

    console.log(`[CreateTransaction] budgetMessage:`, !!budgetMessage);

    res.status(201).json({ 
      success: true, 
      message: 'Transaction added', 
      transaction,
      budgetMessage // Send alert to frontend
    });
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
    await updateAccountBalance(oldTransaction.account, oldTransaction.amount, oldTransaction.type, 'remove', oldTransaction.toAccount, oldTransaction.otherPersonId);

    // 2. Update transaction
    const { isRecurring, frequency, date } = req.body;
    const nextOccurrence = isRecurring ? calculateNextOccurrence(date || oldTransaction.date, frequency) : null;

    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { ...req.body, nextOccurrence },
      { new: true, runValidators: true }
    ).populate('category', 'name icon color type').populate('account', 'name type icon color bankName bankLogo otherPersons').populate('paymentMethod', 'name icon color');

    // 3. Apply new balance impact
    const replenishments = await updateAccountBalance(transaction.account, transaction.amount, transaction.type, 'add', transaction.toAccount, transaction.otherPersonId);

    if (transaction.type === 'income') {
      transaction.autoReplenishments = replenishments || [];
      await transaction.save();
    }

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
    await updateAccountBalance(transaction.account, transaction.amount, transaction.type, 'remove', transaction.toAccount, transaction.otherPersonId);

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
    const { month, year, date, account: accountId } = req.query;
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

    // Total balances from Accounts
    const activeAccounts = await Account.find({ user: req.user._id, isArchived: { $ne: true } });
    const activeAccountIds = activeAccounts.map(a => a._id);

    // Common match criteria
    const matchCriteria = {
      user: req.user._id,
      date: { $gte: startDate, $lte: endDate },
      $or: [
        { account: { $in: activeAccountIds } },
        { toAccount: { $in: activeAccountIds } }
      ]
    };

    if (accountId) {
      matchCriteria.$or = [
        { account: accountId },
        { toAccount: accountId } // Include transfers to this account
      ];
    }

    // Monthly aggregation
    const monthlyAgg = await Transaction.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: '$type',
          totalIncome: { 
            $sum: { 
              $cond: [
                { $or: [
                  { $eq: ['$type', 'income'] },
                  { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$toAccount', accountId ? { $toObjectId: accountId } : null] }] }
                ]}, 
                '$amount', 
                0 
              ] 
            } 
          },
          totalExpense: { 
            $sum: { 
              $cond: [
                { $or: [
                  { $eq: ['$type', 'expense'] },
                  { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$account', accountId ? { $toObjectId: accountId } : null] }] }
                ]}, 
                '$amount', 
                0 
              ] 
            } 
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Simplified aggregation because the conditional logic above is complex
    // Let's do a clearer version
    const totalsAgg = await Transaction.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          income: { 
            $sum: { $cond: [{ $or: [{ $eq: ['$type', 'income'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$toAccount', accountId ? { $toObjectId: accountId } : null] }] }]}, '$amount', 0] } 
          },
          expense: { 
            $sum: { $cond: [{ $or: [{ $eq: ['$type', 'expense'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$account', accountId ? { $toObjectId: accountId } : null] }] }]}, '$amount', 0] } 
          },
          incomeCount: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'income'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$toAccount', accountId ? { $toObjectId: accountId } : null] }] }]}, 1, 0] } },
          expenseCount: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'expense'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$account', accountId ? { $toObjectId: accountId } : null] }] }]}, 1, 0] } },
        }
      }
    ]);

    const stats = totalsAgg[0] || { income: 0, expense: 0, incomeCount: 0, expenseCount: 0 };

    // Total balances from Accounts
    const accounts = activeAccounts;
    console.log(`📦 Summary Version 4: Sending ${accounts.length} active accounts:`, accounts.map(a => a.name));
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    
    // Calculate Other Persons Total (with compatibility for typos - MERGE ALL)
    const otherPersonsTotal = accounts.reduce((sum, acc) => {
      const typoKeys = ['otherPersons', 'otherPersonss', 'otherrPersons', 'otherPersons:', 'otherrPersonss'];
      const uniquePeople = new Map();
      
      for (const key of typoKeys) {
        const items = (key === 'otherPersons' ? acc.otherPersons : acc.get(key)) || [];
        if (Array.isArray(items)) {
          items.forEach(p => {
            if (p.name && !uniquePeople.has(p.name)) {
              // Ensure we don't show negative totals on dashboard even if DB has them
              uniquePeople.set(p.name, Math.max(0, Number(p.amount) || 0));
            }
          });
        }
      }
      
      const accOtherTotal = Array.from(uniquePeople.values()).reduce((s, amt) => s + amt, 0);
      return sum + accOtherTotal;
    }, 0);

    // If specific account or overall, get details and calculate previous balance
    let accountDetails = null;
    let previousBalance = 0;
    
    if (accountId) {
      accountDetails = accounts.find(a => a._id.toString() === accountId);
      if (accountDetails) {
        const transactionsAfterRange = await Transaction.aggregate([
          { 
            $match: { 
              user: req.user._id,
              date: { $gt: endDate },
              $or: [{ account: accountId }, { toAccount: accountId }]
            } 
          },
          {
            $group: {
              _id: null,
              income: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'income'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$toAccount', { $toObjectId: accountId }] }] }]}, '$amount', 0] } },
              expense: { $sum: { $cond: [{ $or: [{ $eq: ['$type', 'expense'] }, { $and: [{ $eq: ['$type', 'transfer'] }, { $eq: ['$account', { $toObjectId: accountId }] }] }]}, '$amount', 0] } },
            }
          }
        ]);
        
        const afterStats = transactionsAfterRange[0] || { income: 0, expense: 0 };
        const netChangeAfter = afterStats.income - afterStats.expense;
        const balanceAtEnd = accountDetails.balance - netChangeAfter;
        previousBalance = balanceAtEnd - (stats.income - stats.expense);
      }
    } else {
      // Global previous balance for Analysis
      const totalCurrentBalance = activeAccounts.reduce((sum, acc) => sum + acc.balance, 0);
      
      const transactionsAfterRange = await Transaction.aggregate([
        { 
          $match: { 
            user: req.user._id,
            date: { $gt: endDate },
            type: { $in: ['income', 'expense'] } // Transfers don't change global balance
          } 
        },
        {
          $group: {
            _id: null,
            income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
            expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
          }
        }
      ]);

      const afterStats = transactionsAfterRange[0] || { income: 0, expense: 0 };
      const netChangeAfter = afterStats.income - afterStats.expense;
      const totalBalanceAtEnd = totalCurrentBalance - netChangeAfter;
      
      // Global previous balance = totalBalanceAtEnd - (totalIncomeInRange - totalExpenseInRange)
      // Note: stats.income/stats.expense already includes income/expense from Transactions matching range
      // but without accountId filter, it includes ALL income/expense.
      previousBalance = totalBalanceAtEnd - (stats.income - stats.expense);
    }

    // Category-wise for the month
    const categoryAgg = await Transaction.aggregate([
      {
        $match: {
          ...matchCriteria,
          type: 'expense',
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
    const recentTxnQuery = { user: req.user._id };
    if (accountId) {
      recentTxnQuery.$or = [{ account: accountId }, { toAccount: accountId }];
    }
    const recentTransactions = await Transaction.find(recentTxnQuery)
      .populate('category', 'name icon color type')
      .populate('account', 'name icon color bankName bankLogo')
      .sort({ date: -1, createdAt: -1 })
      .limit(5);

    // First transaction date
    const firstTransaction = await Transaction.findOne({ user: req.user._id })
      .sort({ date: 1 })
      .select('date');

    res.json({
      success: true,
      summary: {
        balance: accountDetails ? accountDetails.balance : totalBalance,
        otherPersonsTotal: otherPersonsTotal,
        previousBalance: previousBalance,
        totalIncome: stats.income,
        totalExpense: stats.expense,
        incomeCount: stats.incomeCount,
        expenseCount: stats.expenseCount,
        monthly: {
          income: stats.income,
          expense: stats.expense,
          incomeCount: stats.incomeCount,
          expenseCount: stats.expenseCount,
        },
        categoryBreakdown: categoryAgg.map((item) => ({
          category: item._id,
          total: item.total,
          count: item.count,
        })),
        recentTransactions,
        accounts: accountDetails ? [accountDetails] : accounts,
        firstTransactionDate: firstTransaction ? firstTransaction.date : null,
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
