const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  try {
    const uri = process.env.MONGO_URI;
    await mongoose.connect(uri);
    const Account = mongoose.model('Account', new mongoose.Schema({ name: String, isArchived: Boolean, balance: Number }));
    
    const all = await Account.find({});
    const active = all.filter(a => !a.isArchived);
    const archived = all.filter(a => a.isArchived);
    
    const activeSum = active.reduce((s, a) => s + a.balance, 0);
    const archivedSum = archived.reduce((s, a) => s + a.balance, 0);
    
    console.log(`REAL_DATA_START`);
    console.log(`ACTIVE_COUNT: ${active.length}`);
    console.log(`ACTIVE_SUM: ${activeSum}`);
    console.log(`ARCHIVED_COUNT: ${archived.length}`);
    console.log(`ARCHIVED_SUM: ${archivedSum}`);
    console.log(`GRAND_TOTAL: ${activeSum + archivedSum}`);
    console.log(`ACTIVE_NAMES: ${active.map(a => `${a.name}(₹${a.balance})`).join(', ')}`);
    console.log(`REAL_DATA_END`);
    
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
check();
