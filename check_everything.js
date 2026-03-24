const mongoose = require('mongoose');
const Transaction = require('./src/models/Transaction');
const Account = require('./src/models/Account');
require('dotenv').config();

const check = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(uri);
    console.log('--- Database Check ---');

    const lastTxn = await Transaction.findOne().sort({ createdAt: -1 });
    if (!lastTxn) {
      console.log('No transactions found');
      process.exit(0);
    }

    console.log('Last Transaction:', {
      _id: lastTxn._id,
      title: lastTxn.title,
      amount: lastTxn.amount,
      type: lastTxn.type,
      account: lastTxn.account,
      otherPersonId: lastTxn.otherPersonId
    });

    const account = await Account.findById(lastTxn.account);
    if (!account) {
      console.log('Account not found for this transaction');
    } else {
      console.log('Account:', {
        _id: account._id,
        name: account.name,
        balance: account.balance,
        otherPersonsCount: account.otherPersons.length
      });
      console.log('Other Persons Detail:', JSON.stringify(account.otherPersons, null, 2));

      if (lastTxn.otherPersonId) {
        const person = account.otherPersons.id(lastTxn.otherPersonId);
        console.log('Found Linked Person via .id():', person ? person.name : 'NOT FOUND');
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
};

check();
