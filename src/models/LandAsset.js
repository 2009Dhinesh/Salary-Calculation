const mongoose = require('mongoose');

const landAssetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Property name is required'],
      trim: true,
      maxlength: 150,
    },
    type: {
      type: String,
      enum: ['residential', 'commercial', 'agricultural', 'plot', 'flat', 'other'],
      default: 'plot',
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    area: {
      type: Number,
      min: 0,
      default: 0,
    },
    areaUnit: {
      type: String,
      enum: ['sqft', 'sqm', 'acre', 'cent', 'ground'],
      default: 'sqft',
    },
    purchasePrice: {
      type: Number,
      required: [true, 'Purchase price is required'],
      min: 0,
    },
    currentValue: {
      type: Number,
      min: 0,
      default: 0,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    registrationNo: {
      type: String,
      trim: true,
      default: '',
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
    },
  },
  { timestamps: true }
);

landAssetSchema.index({ user: 1 });

module.exports = mongoose.model('LandAsset', landAssetSchema);
