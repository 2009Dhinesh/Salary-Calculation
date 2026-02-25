const mongoose = require('mongoose');

const repaymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: [true, 'Repayment amount is required'],
    min: [0.01, 'Amount must be greater than 0'],
  },
  date: {
    type: Date,
    default: Date.now,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank'],
    default: 'cash',
  },
  bankAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
  },
  upiApp: {
    type: String,
    enum: ['', 'gpay', 'phonepe', 'paytm', 'other'],
    default: '',
  },
  transferMode: {
    type: String,
    enum: ['', 'upi', 'account_transfer', 'neft', 'imps'],
    default: '',
  },
  note: {
    type: String,
    trim: true,
    default: '',
  },
});

const debtSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: [true, 'Contact is required'],
    },
    type: {
      type: String,
      enum: ['given', 'borrowed'],
      required: [true, 'Debt type is required'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'partial', 'completed'],
      default: 'pending',
    },
    // Original payment info
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank'],
      default: 'cash',
    },
    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
    },
    upiApp: {
      type: String,
      enum: ['', 'gpay', 'phonepe', 'paytm', 'other'],
      default: '',
    },
    transferMode: {
      type: String,
      enum: ['', 'upi', 'account_transfer', 'neft', 'imps'],
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, 'Note cannot exceed 500 characters'],
      default: '',
    },
    repayments: [repaymentSchema],
  },
  { timestamps: true }
);

// Pre-save: auto-calculate remaining and status
debtSchema.pre('save', function () {
  this.remainingAmount = Math.max(0, this.totalAmount - this.paidAmount);
  if (this.paidAmount >= this.totalAmount) {
    this.status = 'completed';
    this.remainingAmount = 0;
  } else if (this.paidAmount > 0) {
    this.status = 'partial';
  } else {
    this.status = 'pending';
  }
});

// Indexes for faster queries
debtSchema.index({ user: 1, type: 1, status: 1 });
debtSchema.index({ user: 1, contact: 1 });
debtSchema.index({ user: 1, dueDate: 1 });

module.exports = mongoose.model('Debt', debtSchema);
