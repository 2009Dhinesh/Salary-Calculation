const mongoose = require('mongoose');

const metalAssetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    metalType: {
      type: String,
      enum: ['gold', 'silver'],
      required: [true, 'Metal type is required'],
      default: 'gold',
    },
    name: {
      type: String,
      trim: true,
      default: '',
      maxlength: 100,
    },
    type: {
      type: String,
      enum: ['jewellery', 'coin', 'bar', 'biscuit', 'digital', 'utensil', 'idol', 'other'],
      default: 'jewellery',
    },
    weightGrams: {
      type: Number,
      required: [true, 'Weight in grams is required'],
      min: [0.001, 'Weight must be greater than 0'],
    },
    purity: {
      type: String,
      enum: ['24K', '22K', '18K', '14K', '999', '925', '916', ''],
      default: '',
    },
    purchasePrice: {
      type: Number,
      required: [true, 'Purchase price is required'],
      min: 0,
    },
    purchasePricePerGram: {
      type: Number,
      min: 0,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      trim: true,
      default: '',
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
    },
  },
  { timestamps: true }
);

metalAssetSchema.pre('save', function () {
  // Auto-set name if empty
  if (!this.name) {
    this.name = this.metalType === 'gold' ? 'Gold' : 'Silver';
  }
  // Auto-set purity defaults
  if (!this.purity) {
    this.purity = this.metalType === 'gold' ? '22K' : '999';
  }
  // Calculate price per gram
  if (this.weightGrams > 0) {
    this.purchasePricePerGram = this.purchasePrice / this.weightGrams;
  }
});

metalAssetSchema.index({ user: 1, metalType: 1 });

module.exports = mongoose.model('MetalAsset', metalAssetSchema);
