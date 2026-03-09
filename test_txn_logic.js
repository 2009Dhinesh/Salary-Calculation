const mongoose = require('mongoose');
const Transaction = require('./src/models/Transaction');
const Account = require('./src/models/Account');
const { updateAccountBalance } = require('./src/controllers/transactionController'); // I need to export it or copy it
require('dotenv').config();

// Since it's not exported, I'll redefine it here to test the logic
const testUpdateAccountBalance = async (accountId, amount, type, operation = 'add', toAccountId = null, otherPersonId = null) => {
  const account = await Account.findById(accountId);
  if (account) {
    let change = 0;
    if (type === 'income') change = amount;
    else if (type === 'expense' || type === 'transfer') change = -amount;

    const numAmount = Number(amount);
    if (operation === 'add') account.balance += change;
    else if (operation === 'remove') account.balance -= change;

    if (otherPersonId && (type === 'income' || type === 'expense')) {
      const person = account.otherPersons.id(otherPersonId);
      if (person) {
        const personChange = (type === 'income' ? numAmount : -numAmount);
        const oldVal = person.amount;
        if (operation === 'add') person.amount += personChange;
        else if (operation === 'remove') person.amount -= personChange;
        console.log(`👤 Person ${person.name} amount update: ${oldVal} -> ${person.amount} (change: ${personChange}, op: ${operation})`);
      } else {
        console.log(`⚠️ Person with ID ${otherPersonId} not found in account ${account.name}`);
        console.log(`Available IDs: ${account.otherPersons.map(p => p._id.toString()).join(', ')}`);
      }
    }
    await account.save();
    console.log(`✅ Saved account ${account.name}. New balance: ${account.balance}`);
  }
};

const runTest = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(uri);
    
    // Find an account with persons
    const account = await Account.findOne({ "otherPersons.0": { $exists: true } });
    if (!account) {
      console.log('No account with otherPersons found. Please create one first.');
      process.exit(0);
    }

    const person = account.otherPersons[0];
    console.log(`Testing with Account: ${account.name} and Person: ${person.name} (Current Amount: ${person.amount})`);

    const amount = 50;
    const type = 'income';
    
    await testUpdateAccountBalance(account._id, amount, type, 'add', null, person._id.toString());
    
    const updatedAccount = await Account.findById(account._id);
    const updatedPerson = updatedAccount.otherPersons.id(person._id);
    console.log(`Resulting Person Amount: ${updatedPerson.amount}`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

runTest();
