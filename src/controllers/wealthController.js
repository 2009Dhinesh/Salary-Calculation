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

    // Fetch all data in parallel
    const [accounts, metalAssets, landAssets, debtsGiven, debtsBorrowed, transactions] = await Promise.all([
      Account.find({ user: userId }),
      MetalAsset.find({ user: userId }),
      LandAsset.find({ user: userId }),
      Debt.find({ user: userId, type: 'given', status: { $ne: 'completed' } }),
      Debt.find({ user: userId, type: 'borrowed', status: { $ne: 'completed' } }),
      Transaction.find({ user: userId }),
    ]);

    // Cash / Bank Savings
    const totalCash = accounts.reduce((s, a) => s + (a.balance || 0), 0);

    // Metals (Gold + Silver)
    const goldAssets = metalAssets.filter(a => a.metalType === 'gold');
    const silverAssets = metalAssets.filter(a => a.metalType === 'silver');

    const goldPricePerGram = 14427; // fallback (22K)
    const silverPricePerGram = 85;  // fallback

    const totalGoldWeight = goldAssets.reduce((s, a) => s + a.weightGrams, 0);
    const totalGoldInvested = goldAssets.reduce((s, a) => s + a.purchasePrice, 0);
    const totalGoldValue = totalGoldWeight * goldPricePerGram;

    const totalSilverWeight = silverAssets.reduce((s, a) => s + a.weightGrams, 0);
    const totalSilverInvested = silverAssets.reduce((s, a) => s + a.purchasePrice, 0);
    const totalSilverValue = totalSilverWeight * silverPricePerGram;

    const totalMetalsValue = totalGoldValue + totalSilverValue;
    const totalMetalsInvested = totalGoldInvested + totalSilverInvested;

    // Land
    const totalLandInvested = landAssets.reduce((s, a) => s + a.purchasePrice, 0);
    const totalLandValue = landAssets.reduce((s, a) => s + (a.currentValue || a.purchasePrice), 0);

    // Debts
    const totalLent = debtsGiven.reduce((s, d) => s + d.remainingAmount, 0);
    const totalOwed = debtsBorrowed.reduce((s, d) => s + d.remainingAmount, 0);

    // Income/Expense totals
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalSavings = totalIncome - totalExpense;

    // Net Worth = Savings + Gold + Silver + Land - Liabilities
    const totalAssets = totalCash + totalMetalsValue + totalLandValue + totalLent;
    const totalLiabilities = totalOwed;
    const netWorth = totalAssets - totalLiabilities;

    // Asset distribution for pie chart
    const distribution = [
      { name: 'Cash/Bank', value: totalCash, color: '#6C63FF' },
      { name: 'Gold', value: totalGoldValue, color: '#FFB020' },
      { name: 'Silver', value: totalSilverValue, color: '#C0C0C0' },
      { name: 'Land', value: totalLandValue, color: '#00C896' },
      { name: 'Receivables', value: totalLent, color: '#4ECDC4' },
    ].filter(d => d.value > 0);

    // Monthly trend (last 6 months)
    const now = new Date();
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthName = month.toLocaleDateString('en-IN', { month: 'short' });

      const mIncome = transactions
        .filter(t => t.type === 'income' && new Date(t.date) >= month && new Date(t.date) <= monthEnd)
        .reduce((s, t) => s + t.amount, 0);
      const mExpense = transactions
        .filter(t => t.type === 'expense' && new Date(t.date) >= month && new Date(t.date) <= monthEnd)
        .reduce((s, t) => s + t.amount, 0);

      monthlyTrend.push({ month: monthName, income: mIncome, expense: mExpense, savings: mIncome - mExpense });
    }

    res.json({
      success: true,
      dashboard: {
        netWorth,
        totalAssets,
        totalLiabilities,
        cash: { 
          total: totalCash, 
          accounts: accounts.length,
          list: accounts.map(a => ({ name: a.name, balance: a.balance, bankName: a.bankName }))
        },
        gold: {
          totalWeight: parseFloat(totalGoldWeight.toFixed(3)),
          invested: totalGoldInvested,
          currentValue: totalGoldValue,
          profitLoss: totalGoldValue - totalGoldInvested,
          count: goldAssets.length,
          list: goldAssets.map(a => ({ name: a.name, weight: a.weightGrams, invested: a.purchasePrice, value: a.weightGrams * (a.metalType === 'gold' ? goldPricePerGram : silverPricePerGram) }))
        },
        silver: {
          totalWeight: parseFloat(totalSilverWeight.toFixed(3)),
          invested: totalSilverInvested,
          currentValue: totalSilverValue,
          profitLoss: totalSilverValue - totalSilverInvested,
          count: silverAssets.length,
          list: silverAssets.map(a => ({ name: a.name, weight: a.weightGrams, invested: a.purchasePrice, value: a.weightGrams * (a.metalType === 'gold' ? goldPricePerGram : silverPricePerGram) }))
        },
        metals: {
          invested: totalMetalsInvested,
          currentValue: totalMetalsValue,
          profitLoss: totalMetalsValue - totalMetalsInvested,
        },
        land: {
          invested: totalLandInvested,
          currentValue: totalLandValue,
          appreciation: totalLandValue - totalLandInvested,
          count: landAssets.length,
          list: landAssets.map(a => ({ name: a.name, invested: a.purchasePrice, value: a.currentValue || a.purchasePrice }))
        },
        debts: {
          lent: totalLent,
          owed: totalOwed,
          net: totalLent - totalOwed,
          lentList: debtsGiven.map(d => ({ name: d.personName, amount: d.remainingAmount, info: d.reason })),
          owedList: debtsBorrowed.map(d => ({ name: d.personName, amount: d.remainingAmount, info: d.reason }))
        },
        income: { total: totalIncome },
        expense: { total: totalExpense },
        savings: totalSavings,
        distribution,
        monthlyTrend,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getWealthDashboard };
