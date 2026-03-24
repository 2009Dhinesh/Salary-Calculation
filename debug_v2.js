const mongoose = require('mongoose');
const Transaction = require('./src/models/Transaction');
const Account = require('./src/models/Account');
require('dotenv').config();

const check = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(uri);
    console.log('Connected to DB');

    const lastTransactions = await Transaction.find().sort({ createdAt: -1 }).limit(3).populate('account');
    console.log('--- Last 3 Transactions ---');
    for (const txn of lastTransactions) {
      console.log(`Title: ${txn.title} | Amount: ${txn.amount} | Type: ${txn.type} | PersonID: ${txn.otherPersonId}`);
      if (txn.account) {
        console.log(`  Account: ${txn.account.name} | Balance: ${txn.account.balance}`);
        console.log(`  Persons: ${JSON.stringify(txn.account.otherPersons)}`);
      }
      console.log('---------------------------');
    }

    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

check();
