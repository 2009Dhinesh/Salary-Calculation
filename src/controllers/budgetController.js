const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');

// @desc    Get all budgets for a month
// @route   GET /api/budgets
// @access  Private
const getBudgets = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const currentDate = new Date();
    const targetMonth = parseInt(month) || currentDate.getMonth() + 1;
    const targetYear = parseInt(year) || currentDate.getFullYear();

    const budgets = await Budget.find({
      user: req.user._id,
      month: targetMonth,
      year: targetYear,
    }).populate('category', 'name icon color');

    // Get spending for each budget category this month
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    const spendingAgg = await Transaction.aggregate([
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
          spent: { $sum: '$amount' },
        },
      },
    ]);

    const spendingMap = {};
    spendingAgg.forEach(({ _id, spent }) => {
      spendingMap[_id.toString()] = spent;
    });

    const budgetsWithSpending = budgets.map((budget) => {
      const spent = spendingMap[budget.category._id.toString()] || 0;
      const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
      const threshold = budget.alertThreshold || 80;
      const isOverBudget = spent >= budget.amount; // Changed to >= to treat 100% as over budget/limit reached
      const isNearLimit = percentage >= threshold && spent < budget.amount;

      return {
        ...budget.toObject(),
        spent,
        remaining: Math.max(0, budget.amount - spent),
        percentage: Math.min(percentage, 100),
        isOverBudget,
        isNearLimit,
      };
    });

    res.json({ success: true, budgets: budgetsWithSpending });
  } catch (error) {
    next(error);
  }
};

// @desc    Create budget
// @route   POST /api/budgets
// @access  Private
const createBudget = async (req, res, next) => {
  try {
    const data = { ...req.body, user: req.user._id };
    console.log("Incoming new budget data:", data);
    if (!data.periodType) {
      data.periodType = 'monthly';
    }
    if (data.periodType === 'weekly' && data.weekNumber == null) {
      data.weekNumber = 1;
    }
    if (data.periodType === 'monthly' && data.weekNumber == null) {
      data.weekNumber = 1; // Always provide one to satisfy unique index safely just in case
    }
    console.log("Processed budget data:", data);
    const budget = await Budget.create(data);
    await budget.populate('category', 'name icon color');
    res.status(201).json({ success: true, message: 'Budget created', budget });
  } catch (error) {
    next(error);
  }
};

// @desc    Update budget
// @route   PUT /api/budgets/:id
// @access  Private
const updateBudget = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (data.periodType === 'weekly' && !data.weekNumber) {
      data.weekNumber = 1; 
    }
    
    const budget = await Budget.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      data,
      { new: true, runValidators: true }
    ).populate('category', 'name icon color');

    if (!budget) {
      return res.status(404).json({ success: false, message: 'Budget not found' });
    }

    res.json({ success: true, message: 'Budget updated', budget });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete budget
// @route   DELETE /api/budgets/:id
// @access  Private
const deleteBudget = async (req, res, next) => {
  try {
    const budget = await Budget.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    if (!budget) {
      return res.status(404).json({ success: false, message: 'Budget not found' });
    }

    res.json({ success: true, message: 'Budget deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getBudgets, createBudget, updateBudget, deleteBudget };
