require('dotenv').config();
const mongoose = require('mongoose');
const MetalRate = require('./src/models/MetalRate');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://admin:admin123@cluster0.z09pv.mongodb.net/salarycalc?retryWrites=true&w=majority');
  console.log('Connected to DB');

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Delete today's and yesterday's rates if they exist to start fresh
  await MetalRate.deleteMany({ date: { $in: [today, yesterday] }, metalType: 'gold' });

  // Insert Yesterday's Gold Rates
  await MetalRate.create({
    metalType: 'gold',
    date: yesterday,
    source: 'Coimbatore Market',
    rate: 14860, // 22K previous
    rate24k: 16211,
    rate22k: 14860,
    rate18k: 12720,
    rate14k: 9500,
  });

  // Insert Today's Gold Rates (with exact Coimbatore Website values)
  await MetalRate.create({
    metalType: 'gold',
    date: today,
    source: 'Coimbatore Market',
    rate: 14890, // 22K today 
    rate24k: 16244,
    rate22k: 14890,
    rate18k: 12730,
    rate14k: 9503,
  });

  console.log('updated rates');
  process.exit();
}

run();
