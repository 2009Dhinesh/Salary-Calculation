const Account = require('../models/Account');
const { checkAccountThresholds } = require('../utils/alertHelper');

// Helper: update account balance
const adjustAccountBalance = async (accountId, amount, operation) => {
  if (!accountId) return;
  const account = await Account.findById(accountId);
  if (!account) return;
  if (operation === 'deduct') account.balance -= amount;
  else if (operation === 'add') account.balance += amount;
  await account.save();
};

// @desc    Get all debts with filters
// @route   GET /api/debts
// @access  Private
const getDebts = async (req, res, next) => {
  try {
    const { type, status, contact, sortBy = 'date', sortOrder = 'desc' } = req.query;
    const query = { user: req.user._id };

    if (type) query.type = type;
    if (status) query.status = status;
    if (contact) query.contact = contact;

    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const debts = await Debt.find(query)
      .populate('contact', 'name phone relation icon')
      .populate('bankAccount', 'name icon color bankName bankLogo')
      .populate('repayments.bankAccount', 'name icon color bankName bankLogo')
      .sort(sort);

    res.json({ success: true, debts });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single debt
// @route   GET /api/debts/:id
// @access  Private
const getDebt = async (req, res, next) => {
  try {
    const debt = await Debt.findOne({ _id: req.params.id, user: req.user._id })
      .populate('contact', 'name phone relation icon note')
      .populate('bankAccount', 'name icon color bankName bankLogo')
      .populate('repayments.bankAccount', 'name icon color bankName bankLogo');

    if (!debt) {
      return res.status(404).json({ success: false, message: 'Debt record not found' });
    }

    res.json({ success: true, debt });
  } catch (error) {
    next(error);
  }
};

// @desc    Create debt
// @route   POST /api/debts
// @access  Private
const createDebt = async (req, res, next) => {
  try {
    const { totalAmount, type, paymentMethod, bankAccount, date } = req.body;

    const debt = await Debt.create({
      ...req.body,
      user: req.user._id,
      remainingAmount: totalAmount,
    });

    // Account integration:
    // Given money → deduct from account
    // Borrowed money → add to account
    if (paymentMethod === 'bank' && bankAccount) {
      if (type === 'given') {
        await adjustAccountBalance(bankAccount, totalAmount, 'deduct');
      } else if (type === 'borrowed') {
        await adjustAccountBalance(bankAccount, totalAmount, 'add');
      }
    }

    await debt.populate('contact', 'name phone relation icon');
    await debt.populate('bankAccount', 'name icon color bankName bankLogo');

    // Check for budget alerts if it's an account expense
    let budgetMessage = null;
    if (paymentMethod === 'bank' && bankAccount && type === 'given') {
      budgetMessage = await checkAccountThresholds(req.user._id, bankAccount, totalAmount, date || Date.now());
    }

    console.log(`[DebtController] budgetMessage:`, !!budgetMessage);

    res.status(201).json({ success: true, message: 'Debt record created', debt, budgetMessage });
  } catch (error) {
    next(error);
  }
};

// @desc    Add repayment to debt
// @route   POST /api/debts/:id/repay
// @access  Private
const addRepayment = async (req, res, next) => {
  try {
    const { amount, paymentMethod, bankAccount, upiApp, transferMode, note } = req.body;

    const debt = await Debt.findOne({ _id: req.params.id, user: req.user._id });
    if (!debt) {
      return res.status(404).json({ success: false, message: 'Debt record not found' });
    }

    if (debt.status === 'completed') {
      return res.status(400).json({ success: false, message: 'This debt is already fully paid' });
    }

    if (amount > debt.remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Repayment amount (₹${amount}) exceeds remaining balance (₹${debt.remainingAmount})`,
      });
    }

    // Add repayment entry
    debt.repayments.push({
      amount,
      date: new Date(),
      paymentMethod: paymentMethod || 'cash',
      bankAccount: paymentMethod === 'bank' ? bankAccount : undefined,
      upiApp: upiApp || '',
      transferMode: transferMode || '',
      note: note || '',
    });

    // Update paid amount
    debt.paidAmount += amount;

    // Account integration for repayment:
    // Given debt repayment → money comes BACK → add to account
    // Borrowed debt repayment → we pay back → deduct from account
    if (paymentMethod === 'bank' && bankAccount) {
      if (debt.type === 'given') {
        await adjustAccountBalance(bankAccount, amount, 'add');
      } else if (debt.type === 'borrowed') {
        await adjustAccountBalance(bankAccount, amount, 'deduct');
      }
    }

    await debt.save(); // triggers pre-save to recalc status

    await debt.populate('contact', 'name phone relation icon');
    await debt.populate('bankAccount', 'name icon color bankName bankLogo');
    await debt.populate('repayments.bankAccount', 'name icon color bankName bankLogo');

    res.json({ success: true, message: 'Repayment recorded', debt });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete debt
// @route   DELETE /api/debts/:id
// @access  Private
const deleteDebt = async (req, res, next) => {
  try {
    const debt = await Debt.findOne({ _id: req.params.id, user: req.user._id });
    if (!debt) {
      return res.status(404).json({ success: false, message: 'Debt record not found' });
    }

    // Reverse original account impact
    if (debt.paymentMethod === 'bank' && debt.bankAccount) {
      if (debt.type === 'given') {
        await adjustAccountBalance(debt.bankAccount, debt.totalAmount, 'add');
      } else {
        await adjustAccountBalance(debt.bankAccount, debt.totalAmount, 'deduct');
      }
    }

    // Reverse all repayment account impacts
    for (const repay of debt.repayments) {
      if (repay.paymentMethod === 'bank' && repay.bankAccount) {
        if (debt.type === 'given') {
          await adjustAccountBalance(repay.bankAccount, repay.amount, 'deduct');
        } else {
          await adjustAccountBalance(repay.bankAccount, repay.amount, 'add');
        }
      }
    }

    await debt.deleteOne();
    res.json({ success: true, message: 'Debt record deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get debt summary
// @route   GET /api/debts/summary
// @access  Private
const getDebtSummary = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [givenAgg, borrowedAgg] = await Promise.all([
      Debt.aggregate([
        { $match: { user: userId, type: 'given' } },
        {
          $group: {
            _id: null,
            totalGiven: { $sum: '$totalAmount' },
            totalRecovered: { $sum: '$paidAmount' },
            totalPending: { $sum: '$remainingAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
      Debt.aggregate([
        { $match: { user: userId, type: 'borrowed' } },
        {
          $group: {
            _id: null,
            totalBorrowed: { $sum: '$totalAmount' },
            totalRepaid: { $sum: '$paidAmount' },
            totalOwing: { $sum: '$remainingAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Overdue debts
    const now = new Date();
    const overdueDebts = await Debt.find({
      user: userId,
      dueDate: { $lt: now },
      status: { $ne: 'completed' },
    })
      .populate('contact', 'name icon')
      .sort({ dueDate: 1 })
      .limit(10);

    const given = givenAgg[0] || { totalGiven: 0, totalRecovered: 0, totalPending: 0, count: 0 };
    const borrowed = borrowedAgg[0] || { totalBorrowed: 0, totalRepaid: 0, totalOwing: 0, count: 0 };

    res.json({
      success: true,
      summary: {
        given: {
          total: given.totalGiven,
          recovered: given.totalRecovered,
          pending: given.totalPending,
          count: given.count,
        },
        borrowed: {
          total: borrowed.totalBorrowed,
          repaid: borrowed.totalRepaid,
          owing: borrowed.totalOwing,
          count: borrowed.count,
        },
        overdueDebts,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDebts, getDebt, createDebt, addRepayment, deleteDebt, getDebtSummary };
