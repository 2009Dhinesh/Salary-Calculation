const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Payment method name is required'],
      trim: true,
      maxlength: [30, 'Name cannot exceed 30 characters'],
    },
    icon: {
      type: String,
      default: '💳',
    },
    color: {
      type: String,
      default: '#6C63FF',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Prevent duplicate names for same user
paymentMethodSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
