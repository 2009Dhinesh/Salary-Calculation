const Goal = require('../models/Goal');

// @desc    Get all goals for user
// @route   GET /api/goals
// @access  Private
const getGoals = async (req, res, next) => {
  try {
    const goals = await Goal.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, count: goals.length, goals });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new goal
// @route   POST /api/goals
// @access  Private
const createGoal = async (req, res, next) => {
  try {
    const goal = await Goal.create({
      ...req.body,
      user: req.user._id,
    });
    res.status(201).json({ success: true, goal });
  } catch (error) {
    next(error);
  }
};

// @desc    Update goal
// @route   PUT /api/goals/:id
// @access  Private
const updateGoal = async (req, res, next) => {
  try {
    let goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });

    if (!goal) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    goal = await Goal.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, goal });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete goal
// @route   DELETE /api/goals/:id
// @access  Private
const deleteGoal = async (req, res, next) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });

    if (!goal) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    await goal.deleteOne();
    res.json({ success: true, message: 'Goal deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc    Add funds to goal
// @route   PATCH /api/goals/:id/add-funds
// @access  Private
const addFunds = async (req, res, next) => {
  try {
    const { amount, accountId, paymentMethodId } = req.body;
    let goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });

    if (!goal) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    if (accountId && paymentMethodId) {
      const Account = require('../models/Account');
      const account = await Account.findOne({ _id: accountId, user: req.user._id });
      if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

      const PaymentMethod = require('../models/PaymentMethod');
      const paymentMethod = await PaymentMethod.findOne({ _id: paymentMethodId, user: req.user._id });
      if (!paymentMethod) return res.status(404).json({ success: false, message: 'Payment method not found' });

      if (account.balance < parseFloat(amount)) {
        return res.status(400).json({ success: false, message: `Insufficient balance in selected account. Available balance: ₹${account.balance}` });
      }

      // Find or get a default category for goals/savings
      const Category = require('../models/Category');
      let category = await Category.findOne({ user: req.user._id, name: { $regex: /saving|goal/i } });
      if (!category) {
        category = await Category.findOne({ user: req.user._id });
      }

      // Record a transaction
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        user: req.user._id,
        type: 'expense',
        amount: parseFloat(amount),
        title: `Funded Goal: ${goal.title}`,
        description: `Added funds to savings goal`,
        category: category._id,
        account: account._id,
        paymentMethod: paymentMethod._id,
        date: new Date()
      });

      // Deduct from account
      account.balance -= parseFloat(amount);
      await account.save();
    }

    goal.currentAmount += parseFloat(amount);
    
    // Auto complete if target reached
    if (goal.currentAmount >= goal.targetAmount) {
      goal.status = 'completed';
    }

    await goal.save();
    res.json({ success: true, goal });
  } catch (error) {
    next(error);
  }
};

// @desc    Withdraw funds from goal
// @route   PATCH /api/goals/:id/withdraw-funds
// @access  Private
const withdrawFunds = async (req, res, next) => {
  try {
    const { amount, accountId, paymentMethodId } = req.body;
    let goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });

    if (!goal) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    if (goal.currentAmount < parseFloat(amount)) {
      return res.status(400).json({ success: false, message: `Cannot withdraw more than current goal amount (₹${goal.currentAmount})` });
    }

    if (accountId && paymentMethodId) {
      const Account = require('../models/Account');
      const account = await Account.findOne({ _id: accountId, user: req.user._id });
      if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

      const PaymentMethod = require('../models/PaymentMethod');
      const paymentMethod = await PaymentMethod.findOne({ _id: paymentMethodId, user: req.user._id });
      if (!paymentMethod) return res.status(404).json({ success: false, message: 'Payment method not found' });

      // Find or get a default category for goals/savings
      const Category = require('../models/Category');
      let category = await Category.findOne({ user: req.user._id, name: { $regex: /saving|goal/i } });
      if (!category) {
        category = await Category.findOne({ user: req.user._id });
      }

      // Record a transaction
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        user: req.user._id,
        type: 'income',
        amount: parseFloat(amount),
        title: `Withdrawal from Goal: ${goal.title}`,
        description: `Withdrew funds from savings goal`,
        category: category._id,
        account: account._id,
        paymentMethod: paymentMethod._id,
        date: new Date()
      });

      // Add to account
      account.balance += parseFloat(amount);
      await account.save();
    }

    goal.currentAmount -= parseFloat(amount);
    
    // Auto uncomplete if target fallen below
    if (goal.currentAmount < goal.targetAmount) {
      goal.status = 'active';
    }

    await goal.save();
    res.json({ success: true, goal });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  addFunds,
  withdrawFunds,
};
