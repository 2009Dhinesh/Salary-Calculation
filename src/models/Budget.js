const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Budget amount is required'],
      min: [1, 'Budget must be greater than 0'],
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    periodType: {
      type: String,
      enum: ['monthly', 'weekly'],
      default: 'monthly',
    },
    weekNumber: {
      type: Number,
      required: function() { return this.periodType === 'weekly'; },
    },
    alertThreshold: {
      type: Number,
      default: 80, // alert at 80% of budget
      min: 1,
      max: 100,
    },
    isAlertSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Unique budget per category per period per user
budgetSchema.index({ user: 1, category: 1, month: 1, year: 1, periodType: 1, weekNumber: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
