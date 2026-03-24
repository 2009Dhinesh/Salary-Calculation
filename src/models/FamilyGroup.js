const mongoose = require('mongoose');

const familyGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Family name is required'],
      trim: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    inviteCode: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FamilyGroup', familyGroupSchema);
