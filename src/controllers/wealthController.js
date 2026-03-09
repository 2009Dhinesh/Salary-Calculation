const MetalAsset = require('../models/MetalAsset');
const LandAsset = require('../models/LandAsset');
const Account = require('../models/Account');
const Debt = require('../models/Debt');
const Transaction = require('../models/Transaction');

// @desc    Get complete wealth dashboard
// @route   GET /api/wealth/dashboard
// @access  Private
const getWealthDashboard = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Fetch static assets in parallel
    const [accounts, metalAssets, landAssets, debtsGiven, debtsBorrowed] = await Promise.all([
      Account.find({ user: userId, isArchived: { $ne: true } }).lean(),
      MetalAsset.find({ user: userId }).lean(),
      LandAsset.find({ user: userId }).lean(),
      Debt.find({ user: userId, type: 'given', status: { $ne: 'completed' } }).lean(),
      Debt.find({ user: userId, type: 'borrowed', status: { $ne: 'completed' } }).lean(),
    ]);

    // Use aggregation for transaction totals to avoid loading all transactions into memory
    const transactionStats = await Transaction.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' }
        }
      }
    ]);

    const statsMap = transactionStats.reduce((acc, curr) => {
      acc[curr._id] = curr.total;
      return acc;
    }, { income: 0, expense: 0 });

    // Cash / Bank Savings
    const totalCash = accounts.reduce((s, a) => s + (a.balance || 0), 0);

    // Metals (Gold + Silver) - Fallback prices should be dynamic in real app, but keeping structure
    const goldPricePerGram = 14427; 
    const silverPricePerGram = 85;

    let totalGoldWeight = 0, totalGoldInvested = 0, totalSilverWeight = 0, totalSilverInvested = 0;
    
    metalAssets.forEach(a => {
      if (a.metalType === 'gold') {
        totalGoldWeight += a.weightGrams;
        totalGoldInvested += a.purchasePrice;
      } else {
        totalSilverWeight += a.weightGrams;
        totalSilverInvested += a.purchasePrice;
      }
    });

    const totalGoldValue = totalGoldWeight * goldPricePerGram;
    const totalSilverValue = totalSilverWeight * silverPricePerGram;
    const totalMetalsValue = totalGoldValue + totalSilverValue;
    const totalMetalsInvested = totalGoldInvested + totalSilverInvested;

    // Land
    const totalLandInvested = landAssets.reduce((s, a) => s + a.purchasePrice, 0);
    const totalLandValue = landAssets.reduce((s, a) => s + (a.currentValue || a.purchasePrice), 0);

    // Debts
    const totalLent = debtsGiven.reduce((s, d) => s + d.remainingAmount, 0);
    const totalOwed = debtsBorrowed.reduce((s, d) => s + d.remainingAmount, 0);

    // Net Worth Calculation
    const totalAssets = totalCash + totalMetalsValue + totalLandValue + totalLent;
    const netWorth = totalAssets - totalOwed;

    // Asset distribution
    const distribution = [
      { name: 'Cash/Bank', value: totalCash, color: '#6C63FF' },
      { name: 'Gold', value: totalGoldValue, color: '#FFB020' },
      { name: 'Silver', value: totalSilverValue, color: '#C0C0C0' },
      { name: 'Land', value: totalLandValue, color: '#00C896' },
      { name: 'Receivables', value: totalLent, color: '#4ECDC4' },
    ].filter(d => d.value > 0);

    // Monthly trend (last 6 months) using Aggregation
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    
    const trendAgg = await Transaction.aggregate([
      { 
        $match: { 
          user: userId, 
          date: { $gte: sixMonthsAgo },
          type: { $in: ['income', 'expense'] }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type'
          },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mNum = d.getMonth() + 1;
      const yNum = d.getFullYear();
      const mName = d.toLocaleDateString('en-IN', { month: 'short' });

      const income = trendAgg.find(t => t._id.month === mNum && t._id.year === yNum && t._id.type === 'income')?.total || 0;
      const expense = trendAgg.find(t => t._id.month === mNum && t._id.year === yNum && t._id.type === 'expense')?.total || 0;

      monthlyTrend.push({
        month: mName,
        income,
        expense,
        savings: income - expense
      });
    }

    res.json({
      success: true,
      dashboard: {
        netWorth,
        totalAssets,
        totalLiabilities: totalOwed,
        cash: { total: totalCash, accounts: accounts.length, list: accounts.map(a => ({ name: a.name, balance: a.balance, bankName: a.bankName })) },
        gold: { totalWeight: parseFloat(totalGoldWeight.toFixed(3)), invested: totalGoldInvested, currentValue: totalGoldValue, profitLoss: totalGoldValue - totalGoldInvested, count: metalAssets.filter(a => a.metalType === 'gold').length },
        silver: { totalWeight: parseFloat(totalSilverWeight.toFixed(3)), invested: totalSilverInvested, currentValue: totalSilverValue, profitLoss: totalSilverValue - totalSilverInvested, count: metalAssets.filter(a => a.metalType === 'silver').length },
        metals: { invested: totalMetalsInvested, currentValue: totalMetalsValue, profitLoss: totalMetalsValue - totalMetalsInvested },
        land: { invested: totalLandInvested, currentValue: totalLandValue, appreciation: totalLandValue - totalLandInvested, count: landAssets.length },
        debts: { lent: totalLent, owed: totalOwed, net: totalLent - totalOwed },
        income: { total: statsMap.income },
        expense: { total: statsMap.expense },
        savings: statsMap.income - statsMap.expense,
        distribution,
        monthlyTrend,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getWealthDashboard };
