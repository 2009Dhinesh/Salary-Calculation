const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Account name is required'],
      trim: true,
      maxlength: [30, 'Account name cannot exceed 30 characters'],
    },
    type: {
      type: String,
      default: 'cash',
    },
    bankName: {
      type: String,
      trim: true,
    },
    bankLogo: {
      type: String,
      default: '',
      trim: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    initialBalance: {
      type: Number,
      default: 0,
    },
    color: {
      type: String,
      default: '#6C63FF',
    },
    icon: {
      type: String,
      default: '💳',
    },
  },
  { timestamps: true }
);

// Prevent duplicate account names for the same user
accountSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Account', accountSchema);
