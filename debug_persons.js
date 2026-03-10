const mongoose = require('mongoose');
const Transaction = require('./src/models/Transaction');
const Account = require('./src/models/Account');
require('dotenv').config();

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const lastTxn = await Transaction.findOne().sort({ createdAt: -1 }).populate('account');
    console.log('--- Last Transaction ---');
    console.log('Title:', lastTxn.title);
    console.log('Type:', lastTxn.type);
    console.log('Amount:', lastTxn.amount);
    console.log('OtherPersonId:', lastTxn.otherPersonId);
    
    if (lastTxn.account) {
      console.log('\n--- Associated Account ---');
      console.log('Name:', lastTxn.account.name);
      console.log('Total Balance:', lastTxn.account.balance);
      console.log('OtherPersons:', JSON.stringify(lastTxn.account.otherPersons, null, 2));
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

check();
