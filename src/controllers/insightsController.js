const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Category = require('../models/Category');

// @desc    Get AI-driven financial insights
// @route   GET /api/insights
// @access  Private
const getInsights = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Get totals and category breakdown using aggregation in parallel
    const [thisMonthStats, lastMonthStats, budgets] = await Promise.all([
      Transaction.aggregate([
        { 
          $match: { 
            user: userId, 
            type: 'expense', 
            date: { $gte: firstDayThisMonth } 
          } 
        },
        {
          $facet: {
            total: [{ $group: { _id: null, sum: { $sum: '$amount' } } }],
            categories: [
              { $group: { _id: '$category', total: { $sum: '$amount' } } },
              { $sort: { total: -1 } },
              { $limit: 5 }
            ]
          }
        }
      ]),
      Transaction.aggregate([
        { 
          $match: { 
            user: userId, 
            type: 'expense', 
            date: { $gte: firstDayLastMonth, $lt: firstDayThisMonth } 
          } 
        },
        { $group: { _id: null, sum: { $sum: '$amount' } } }
      ]),
      Budget.find({ user: userId }).populate('category', 'name').lean()
    ]);

    const thisMonthTotal = thisMonthStats[0]?.total[0]?.sum || 0;
    const lastMonthTotal = lastMonthStats[0]?.sum || 0;
    const topCategoriesAgg = thisMonthStats[0]?.categories || [];

    // Populate category names for top categories if needed
    const topCategories = await Category.populate(topCategoriesAgg, { path: '_id', select: 'name' });

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
    const topCategory = topCategories[0];
    if (topCategory && topCategory.total > thisMonthTotal * 0.4) {
      insights.push({
        type: 'info',
        title: 'Heads Up',
        message: `${topCategory._id?.name || 'A single category'} accounts for ${Math.round((topCategory.total/thisMonthTotal)*100)}% of your spending.`,
        suggestion: `Check if there are cheaper alternatives for ${topCategory._id?.name || 'this category'}.`
      });
    }

    // Budget Insight
    budgets.forEach(b => {
      const matchingCat = topCategories.find(c => c._id?._id?.toString() === b.category?._id?.toString());
      const spent = matchingCat ? matchingCat.total : 0;
      
      if (spent > b.amount * 0.9 && spent <= b.amount) {
        insights.push({
          type: 'warning',
          title: 'Budget Alert',
          message: `You've reached 90% of your ${b.category?.name || 'category'} budget.`,
          suggestion: 'Maybe wait until next month for more purchases in this category.'
        });
      }
    });

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
