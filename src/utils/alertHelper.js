const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const mongoose = require('mongoose');

/**
 * Checks if a transaction amount crosses any monthly spending thresholds for an account.
 */
const checkAccountThresholds = async (userId, accountId, amount, transactionDate = new Date()) => {
  try {
    console.log(`\n[AlertHelper] ======= DEBUG START =======`);
    const account = await Account.findById(accountId);
    if (!account) {
      console.log(`[AlertHelper] ❌ Account not found: ${accountId}`);
      return null;
    }

    const limit = Number(account.monthlyLimit);
    console.log(`[AlertHelper] Account: ${account.name} (ID: ${accountId})`);
    console.log(`[AlertHelper] Monthly Limit: ₹${limit}`);

    if (!(limit > 0)) {
      console.log(`[AlertHelper] ℹ️ No limit set or limit is zero. Exiting.`);
      return null;
    }

    const numAmount = Number(amount);
    const refDate = new Date(transactionDate);
    const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);

    console.log(`[AlertHelper] Current Trans: ₹${numAmount}`);
    console.log(`[AlertHelper] Date Range: ${startOfMonth.toISOString()} - ${endOfMonth.toISOString()}`);

    // Find all expense transactions in this month for this account
    const query = {
      user: new mongoose.Types.ObjectId(userId),
      account: new mongoose.Types.ObjectId(accountId),
      type: 'expense',
      date: { $gte: startOfMonth, $lte: endOfMonth }
    };
    
    console.log(`[AlertHelper] Query: ${JSON.stringify(query)}`);
    const transactions = await Transaction.find(query);
    console.log(`[AlertHelper] Found ${transactions.length} transactions in database.`);

    let dbTotal = 0;
    let currentTxnFound = false;
    transactions.forEach(t => {
      dbTotal += Number(t.amount);
      // Try to see if our current transaction is already in the list
      // (sometimes DB reflects it immediately, sometimes not)
      if (Number(t.amount) === numAmount && t.title === 'Last try' || t.title === 'Try') {
         // This is a loose check just for debug
      }
    });

    // To be safe, if we just created it, ensure it's counted
    // If dbTotal is less than numAmount, it definitely didn't include it.
    // If dbTotal is >= numAmount, it MIGHT have included it.
    // For reliability, we'll calculate: 
    // totalSpent = Sum of ALL transactions in DB for this month (including the new one if it's there)
    // BUT since we call this AFTER Transaction.create, it SHOULD be there.
    
    const totalSpent = dbTotal;
    const previousSpent = totalSpent - numAmount;
    
    const currentPercent = (totalSpent / limit) * 100;
    const previousPercent = (previousSpent / limit) * 100;

    console.log(`[AlertHelper] Calculation:`);
    console.log(`  Total Spent (This Month): ₹${totalSpent.toFixed(2)}`);
    console.log(`  Previous Spent: ₹${previousSpent.toFixed(2)}`);
    console.log(`  Current %: ${currentPercent.toFixed(1)}%`);
    console.log(`  Previous %: ${previousPercent.toFixed(1)}%`);

    const thresholds = [100, 90, 75, 50];
    for (const threshold of thresholds) {
      const isCrossed = currentPercent >= threshold && previousPercent < threshold;
      console.log(`  Check ${threshold}%: ${isCrossed ? '✅ YES' : '❌ NO'} (Current >= ${threshold} AND Prev < ${threshold})`);
      
      if (isCrossed) {
        console.log(`[AlertHelper] 🔔 TRIGGERING ${threshold}% ALERT!`);
        return {
          threshold,
          message: `Limit Alert ⚠️: You have reached ${threshold}% of your ₹${limit.toLocaleString()} monthly limit for ${account.name}.`,
          totalSpent,
          limit
        };
      }
    }

    console.log(`[AlertHelper] ======= DEBUG END (No Alert) =======\n`);
    return null;
  } catch (error) {
    console.error('[AlertHelper] ❌ SYSTEM ERROR:', error);
    return null;
  }
};

module.exports = { checkAccountThresholds };
