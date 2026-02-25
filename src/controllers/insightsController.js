const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Category = require('../models/Category');

// @desc    Get AI-driven financial insights
// @route   GET /api/insights
// @access  Private
const getInsights = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // 1. Get spending this month vs last month
    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonthTransactions = await Transaction.find({
      user: userId,
      type: 'expense',
      date: { $gte: firstDayThisMonth }
    }).populate('category');

    const lastMonthTransactions = await Transaction.find({
      user: userId,
      type: 'expense',
      date: { $gte: firstDayLastMonth, $lt: firstDayThisMonth }
    });

    const thisMonthTotal = thisMonthTransactions.reduce((acc, t) => acc + t.amount, 0);
    const lastMonthTotal = lastMonthTransactions.reduce((acc, t) => acc + t.amount, 0);

    const insights = [];

    // Trend Insight
    if (lastMonthTotal > 0) {
      const diff = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
      if (diff > 10) {
        insights.push({
          type: 'warning',
          title: 'Spending Surge',
          message: `You've spent ${Math.round(diff)}% more than last month. Consider reviewing your non-essential expenses.`,
          suggestion: 'Try setting tighter limits on entertainment or dining out.'
        });
      } else if (diff < -10) {
        insights.push({
          type: 'success',
          title: 'Great Progress!',
          message: `You've spent ${Math.round(Math.abs(diff))}% less than last month!`,
          suggestion: 'Excellent work! You can move these savings to your goals.'
        });
      }
    }

    // Category Specific Insight
    const categoryTotals = {};
    thisMonthTransactions.forEach(t => {
      const catName = t.category?.name || 'Uncategorized';
      categoryTotals[catName] = (categoryTotals[catName] || 0) + t.amount;
    });

    const topCategory = Object.entries(categoryTotals).sort((a,b) => b[1] - a[1])[0];
    if (topCategory && topCategory[1] > thisMonthTotal * 0.4) {
      insights.push({
        type: 'info',
        title: 'Heads Up',
        message: `${topCategory[0]} accounts for ${Math.round((topCategory[1]/thisMonthTotal)*100)}% of your spending.`,
        suggestion: `Check if there are cheaper alternatives for ${topCategory[0]}.`
      });
    }

    // Budget Insight
    const budgets = await Budget.find({ user: userId }).populate('category');
    budgets.forEach(b => {
      const spent = categoryTotals[b.category?.name] || 0;
      if (spent > b.amount * 0.9 && spent <= b.amount) {
        insights.push({
          type: 'warning',
          title: 'Budget Alert',
          message: `You've reached 90% of your ${b.category?.name} budget.`,
          suggestion: 'Maybe wait until next month for more purchases in this category.'
        });
      }
    });

    // Smart Suggestion
    if (insights.length === 0) {
      insights.push({
        type: 'info',
        title: 'Steady Going',
        message: 'Your spending patterns are stable this month.',
        suggestion: 'This is a good time to increase your monthly investment slightly.'
      });
    }

    res.json({ success: true, insights });
  } catch (error) {
    next(error);
  }
};

module.exports = { getInsights };
