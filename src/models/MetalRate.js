const mongoose = require('mongoose');

const metalRateSchema = new mongoose.Schema(
  {
    metalType: {
      type: String,
      enum: ['gold', 'silver'],
      required: true,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    rate24k: { type: Number, default: 0 },
    rate22k: { type: Number, default: 0 },
    rate18k: { type: Number, default: 0 },
    rate999: { type: Number, default: 0 },
    rate925: { type: Number, default: 0 },
    date: {
      type: String, // YYYY-MM-DD format for easy daily comparison
      required: true,
    },
    source: {
      type: String,
      default: 'fallback',
    },
  },
  { timestamps: true }
);

// Compound unique index: one rate per metal per day
metalRateSchema.index({ metalType: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('MetalRate', metalRateSchema);
