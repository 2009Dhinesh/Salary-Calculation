const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Contact name is required'],
      trim: true,
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    relation: {
      type: String,
      enum: ['friend', 'family', 'relative', 'colleague', 'other'],
      default: 'friend',
    },
    note: {
      type: String,
      trim: true,
      maxlength: [200, 'Note cannot exceed 200 characters'],
      default: '',
    },
    icon: {
      type: String,
      default: '👤',
    },
  },
  { timestamps: true }
);

// Prevent duplicate contacts for same user
contactSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Contact', contactSchema);
