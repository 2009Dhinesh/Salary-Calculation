const mongoose = require('mongoose');

const InvestmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please add a name for the investment'],
    trim: true
  },
  symbol: {
    type: String, // e.g., AAPL, RELIANCE, BTC
    trim: true,
    uppercase: true
  },
  type: {
    type: String,
    enum: ['stock', 'crypto', 'mutual_fund', 'bond', 'other'],
    default: 'stock'
  },
  units: {
    type: Number,
    required: [true, 'Please add number of units/shares'],
    min: [0, 'Units cannot be negative']
  },
  buyPrice: {
    type: Number,
    required: [true, 'Please add buy price'],
    min: [0, 'Price cannot be negative']
  },
  currentPrice: {
    type: Number,
    min: [0, 'Price cannot be negative']
  },
  date: {
    type: Date,
    default: Date.now
  },
  notes: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total value
InvestmentSchema.virtual('totalValue').get(function() {
  return (this.currentPrice || this.buyPrice) * this.units;
});

// Virtual for profit/loss
InvestmentSchema.virtual('profit').get(function() {
  if (!this.currentPrice) return 0;
  return (this.currentPrice - this.buyPrice) * this.units;
});

InvestmentSchema.virtual('profitPercentage').get(function() {
  if (!this.currentPrice || this.buyPrice === 0) return 0;
  return ((this.currentPrice - this.buyPrice) / this.buyPrice) * 100;
});

module.exports = mongoose.model('Investment', InvestmentSchema);
