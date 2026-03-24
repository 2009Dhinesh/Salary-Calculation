require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const PaymentMethod = require('./src/models/PaymentMethod');
const Transaction = require('./src/models/Transaction');
const Goal = require('./src/models/Goal');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://admin:admin123@cluster0.z09pv.mongodb.net/salarycalc?retryWrites=true&w=majority');
  console.log('Connected');

  const users = await User.find({});
  for (const user of users) {
    const pms = await PaymentMethod.find({ user: user._id });

    // Ensure they have the basic 4:
    const needed = ['Bank', 'Cash', 'Card', 'UPI'];
    for (const n of needed) {
      if (!pms.find(p => p.name === n)) {
        let replacement = null;
        if (n === 'Bank') replacement = pms.find(p => p.name === 'Bank Transfer');
        if (n === 'Card') replacement = pms.find(p => p.name === 'Credit Card' || p.name === 'Debit Card');
        
        if (replacement) {
          replacement.name = n;
          await replacement.save();
        } else {
          await PaymentMethod.create({ user: user._id, name: n, isDefault: true, icon: n === 'Cash' ? '💵' : n === 'Bank' ? '🏦' : n === 'Card' ? '💳' : '📱', color: n === 'Cash' ? '#27AE60' : n === 'Bank' ? '#16A085' : n === 'Card' ? '#3498DB' : '#6C63FF' });
        }
      }
    }

    // Refresh pms after creates/updates
    const updatedPms = await PaymentMethod.find({ user: user._id });
    const bankId = updatedPms.find(p => p.name === 'Bank')._id;
    const cardId = updatedPms.find(p => p.name === 'Card')._id;
    const cashId = updatedPms.find(p => p.name === 'Cash')._id;

    // Migrate old ones and delete them
    const toDelete = ['Bank Transfer', 'Credit Card', 'Debit Card', 'Check', 'Other'];
    for (const d of toDelete) {
      const target = updatedPms.find(p => p.name === d);
      if (target) {
        let substituteId = cashId; // default
        if (d.includes('Bank') || d === 'Check') substituteId = bankId;
        if (d.includes('Card')) substituteId = cardId;
        
        // Update Transactions
        await Transaction.updateMany({ user: user._id, paymentMethod: target._id }, { paymentMethod: substituteId });
        
        // Remove payment method
        await PaymentMethod.deleteOne({ _id: target._id });
      }
    }
  }

  console.log('Migration Complete');
  process.exit(0);
}

run();
