const mongoose = require('mongoose');
const Account = require('../src/models/Account');
require('dotenv').config();

const migrateLegacyPersons = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGO_URI is not defined');
    
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const accounts = await Account.find({});
    console.log(`🔍 Checking ${accounts.length} accounts for legacy typos...`);

    const typoKeys = [
      'otherPersonss', 
      'otherrPersons', 
      'otherPersons:', 
      'otherrPersonss',
      'otherPerson'
    ];

    let totalMigrated = 0;

    for (const account of accounts) {
      let migrationNeeded = false;
      
      if (!account.otherPersons) account.otherPersons = [];

      for (const key of typoKeys) {
        const typoData = account.get(key);
        if (Array.isArray(typoData) && typoData.length > 0) {
          console.log(`📦 Account "${account.name}": Found legacy field "${key}" with ${typoData.length} items`);
          
          for (const person of typoData) {
            // Check if person already exists in otherPersons (by name or ID)
            const exists = account.otherPersons.some(p => 
              (p._id && person._id && p._id.toString() === person._id.toString()) || 
              (p.name && person.name && p.name.trim().toLowerCase() === person.name.trim().toLowerCase())
            );

            if (!exists) {
              account.otherPersons.push({
                name: person.name,
                amount: person.amount || 0,
                targetAmount: person.targetAmount !== undefined ? person.targetAmount : (person.amount || 0)
              });
            }
          }
          
          // Clear the typo field
          account.set(key, undefined);
          migrationNeeded = true;
        }
      }

      if (migrationNeeded) {
        await account.save();
        console.log(`✅ Account "${account.name}" migrated successfully.`);
        totalMigrated++;
      }
    }

    console.log(`🎉 Migration complete. ${totalMigrated} accounts were updated.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
};

migrateLegacyPersons();
