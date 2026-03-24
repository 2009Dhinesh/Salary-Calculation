const mongoose = require('mongoose');

const joinRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyGroup',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JoinRequest', joinRequestSchema);
