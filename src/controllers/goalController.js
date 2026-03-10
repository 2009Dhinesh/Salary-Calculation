const Goal = require('../models/Goal');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const PaymentMethod = require('../models/PaymentMethod');
const { checkAccountThresholds } = require('../utils/alertHelper');

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

    // REFUND LOGIC:
    console.log(`[DeleteGoal] Deleting goal: ${goal.title}, CurrentAmount: ${goal.currentAmount}`);
    if (goal.currentAmount > 0) {
      if (!goal.contributions || goal.contributions.length === 0) {
        console.log(`[DeleteGoal] WARNING: Goal has funds but no contribution tracking data. Refund skipped.`);
      } else {
        console.log(`[DeleteGoal] Found ${goal.contributions.length} contribution entries.`);
        // Find or get a default category for goals/savings
        let category = await Category.findOne({ user: req.user._id, name: { $regex: /saving|goal/i } });
        if (!category) {
          category = await Category.findOne({ user: req.user._id });
        }

        // Find a default payment method if none exists (just for transaction record)
        const paymentMethod = await PaymentMethod.findOne({ user: req.user._id });

        for (const contribution of goal.contributions) {
          console.log(`[DeleteGoal] Processing contribution: Account ${contribution.account}, Amount ₹${contribution.amount}`);
          if (contribution.amount > 0) {
            const account = await Account.findById(contribution.account);
            if (account) {
              // Add back to account
              account.balance += contribution.amount;
              await account.save();
              console.log(`[DeleteGoal] Refunded ₹${contribution.amount} to account: ${account.name}. New balance: ₹${account.balance}`);

              // Record a refund transaction
              await Transaction.create({
                user: req.user._id,
                type: 'income',
                amount: contribution.amount,
                title: `Goal Refund: ${goal.title}`,
                description: `Refunded contributions from deleted goal`,
                category: category._id,
                account: account._id,
                paymentMethod: paymentMethod?._id,
                date: new Date()
              });
            } else {
              console.log(`[DeleteGoal] ERROR: Account ${contribution.account} not found for refund.`);
            }
          }
        }
      }
    }

    await goal.deleteOne();
    res.json({ success: true, message: 'Goal deleted and funds refunded' });
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

    const fundAmount = parseFloat(amount);

    if (accountId && paymentMethodId) {
      const account = await Account.findOne({ _id: accountId, user: req.user._id });
      if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

      const paymentMethod = await PaymentMethod.findOne({ _id: paymentMethodId, user: req.user._id });
      if (!paymentMethod) return res.status(404).json({ success: false, message: 'Payment method not found' });

      if (account.balance < fundAmount) {
        return res.status(400).json({ success: false, message: `Insufficient balance in selected account. Available balance: ₹${account.balance}` });
      }

      // Find or get a default category for goals/savings
      let category = await Category.findOne({ user: req.user._id, name: { $regex: /saving|goal/i } });
      if (!category) {
        category = await Category.findOne({ user: req.user._id });
      }

      // Record a transaction
      await Transaction.create({
        user: req.user._id,
        type: 'expense',
        amount: fundAmount,
        title: `Funded Goal: ${goal.title}`,
        description: `Added funds to savings goal`,
        category: category._id,
        account: account._id,
        paymentMethod: paymentMethod._id,
        date: new Date()
      });

      // Deduct from account
      account.balance -= fundAmount;
      await account.save();

      // Tracking contribution
      if (!goal.contributions) goal.contributions = [];
      const contribIndex = goal.contributions.findIndex(c => c.account.toString() === accountId);
      if (contribIndex > -1) {
        goal.contributions[contribIndex].amount += fundAmount;
      } else {
        goal.contributions.push({ account: accountId, amount: fundAmount });
      }
      console.log(`[AddFunds] Tracked contribution: Account ${accountId}, Added ₹${fundAmount}. Total for account: ${contribIndex > -1 ? goal.contributions[contribIndex].amount : fundAmount}`);
    }

    goal.currentAmount += fundAmount;
    
    // Auto complete if target reached
    if (goal.currentAmount >= goal.targetAmount) {
      goal.status = 'completed';
    }

    await goal.save();
    
    // Check for budget alerts since this is an expense
    const budgetMessage = await checkAccountThresholds(req.user._id, accountId, fundAmount, new Date());
    console.log(`[GoalController] budgetMessage:`, !!budgetMessage);

    res.json({ success: true, goal, budgetMessage });
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

    const withdrawAmount = parseFloat(amount);

    if (goal.currentAmount < withdrawAmount) {
      return res.status(400).json({ success: false, message: `Cannot withdraw more than current goal amount (₹${goal.currentAmount})` });
    }

    if (accountId && paymentMethodId) {
      const account = await Account.findOne({ _id: accountId, user: req.user._id });
      if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

      const paymentMethod = await PaymentMethod.findOne({ _id: paymentMethodId, user: req.user._id });
      if (!paymentMethod) return res.status(404).json({ success: false, message: 'Payment method not found' });

      // Find or get a default category for goals/savings
      let category = await Category.findOne({ user: req.user._id, name: { $regex: /saving|goal/i } });
      if (!category) {
        category = await Category.findOne({ user: req.user._id });
      }

      // Record a transaction
      await Transaction.create({
        user: req.user._id,
        type: 'income',
        amount: withdrawAmount,
        title: `Withdrawal from Goal: ${goal.title}`,
        description: `Withdrew funds from savings goal`,
        category: category._id,
        account: account._id,
        paymentMethod: paymentMethod._id,
        date: new Date()
      });

      // Add to account
      account.balance += withdrawAmount;
      await account.save();

      // Adjust contributions proportionally
      if (!goal.contributions) goal.contributions = [];
      let remainingToDeduct = withdrawAmount;
      const targetContrib = goal.contributions.find(c => c.account.toString() === accountId);
      if (targetContrib) {
        const deduct = Math.min(targetContrib.amount, remainingToDeduct);
        targetContrib.amount -= deduct;
        remainingToDeduct -= deduct;
        console.log(`[WithdrawFunds] Deducted ₹${deduct} from target account contribution.`);
      }

      if (remainingToDeduct > 0) {
        for (let i = 0; i < goal.contributions.length; i++) {
          const deduct = Math.min(goal.contributions[i].amount, remainingToDeduct);
          goal.contributions[i].amount -= deduct;
          remainingToDeduct -= deduct;
          console.log(`[WithdrawFunds] Deducted ₹${deduct} from account ${goal.contributions[i].account} contribution.`);
          if (remainingToDeduct <= 0) break;
        }
      }
    } else {
      // If no account specified, just reduce proportionally
      if (!goal.contributions) goal.contributions = [];
      let remainingToDeduct = withdrawAmount;
      for (let i = 0; i < goal.contributions.length; i++) {
        const deduct = Math.min(goal.contributions[i].amount, remainingToDeduct);
        goal.contributions[i].amount -= deduct;
        remainingToDeduct -= deduct;
        console.log(`[WithdrawFunds] Deducted ₹${deduct} from account ${goal.contributions[i].account} contribution.`);
        if (remainingToDeduct <= 0) break;
      }
    }

    goal.currentAmount -= withdrawAmount;
    
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
