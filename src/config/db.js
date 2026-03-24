const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri || uri.includes('localhost')) {
      console.warn('⚠️  Using localhost MongoDB. If not installed, get a free Atlas URI:');
      console.warn('   👉 https://www.mongodb.com/cloud/atlas/register');
      console.warn('   Then update MONGO_URI in server/.env\n');
    }

    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10, // Increase pool size for concurrent requests
      minPoolSize: 2,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`\n❌  MongoDB Connection Failed!`);
    console.error(`    Error: ${error.message}\n`);
    console.error(`📋  FIX: MongoDB is not running locally. Use a free cloud DB:`);
    console.error(`    1. Go to: https://cloud.mongodb.com/`);
    console.error(`    2. Create a free cluster`);
    console.error(`    3. Get the connection string`);
    console.error(`    4. Update MONGO_URI in server/.env\n`);
    process.exit(1);
  }
};

module.exports = connectDB;
