const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Please add a goal title'],
      trim: true,
    },
    targetAmount: {
      type: Number,
      required: [true, 'Please add a target amount'],
      min: [1, 'Target amount must be at least 1'],
    },
    currentAmount: {
      type: Number,
      default: 0,
    },
    deadline: {
      type: Date,
    },
    category: {
      type: String,
      enum: ['saving', 'purchase', 'emergency', 'investment', 'other'],
      default: 'saving',
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    icon: {
      type: String,
      default: '🎯',
    },
    color: {
      type: String,
      default: '#6C63FF',
    },
    contributions: [
      {
        account: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Account',
        },
        amount: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for progress percentage
goalSchema.virtual('progress').get(function () {
  if (this.targetAmount === 0) return 0;
  const progress = (this.currentAmount / this.targetAmount) * 100;
  return Math.min(Math.round(progress), 100);
});

// Virtual for remaining amount
goalSchema.virtual('remainingAmount').get(function () {
  return Math.max(this.targetAmount - this.currentAmount, 0);
});

module.exports = mongoose.model('Goal', goalSchema);
