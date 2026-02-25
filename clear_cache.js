require('dotenv').config();
const mongoose = require('mongoose');
const MetalRate = require('./src/models/MetalRate');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://admin:admin123@cluster0.z09pv.mongodb.net/salarycalc?retryWrites=true&w=majority');
  
  const today = new Date().toISOString().split('T')[0];
  await MetalRate.deleteMany({ date: today });
  console.log('Cleared today cache so new Live API kicks in!');
  process.exit();
}
run();
