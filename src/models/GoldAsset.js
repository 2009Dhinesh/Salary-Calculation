const mongoose = require('mongoose');

const goldAssetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      trim: true,
      default: 'Gold',
      maxlength: 100,
    },
    type: {
      type: String,
      enum: ['jewellery', 'coin', 'bar', 'digital', 'other'],
      default: 'jewellery',
    },
    weightGrams: {
      type: Number,
      required: [true, 'Weight in grams is required'],
      min: [0.001, 'Weight must be greater than 0'],
    },
    purity: {
      type: String,
      enum: ['24K', '22K', '18K', '14K'],
      default: '22K',
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
    // Which account was used to buy
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
    },
  },
  { timestamps: true }
);

goldAssetSchema.pre('save', function () {
  if (this.weightGrams > 0) {
    this.purchasePricePerGram = this.purchasePrice / this.weightGrams;
  }
});

goldAssetSchema.index({ user: 1 });

module.exports = mongoose.model('GoldAsset', goldAssetSchema);
