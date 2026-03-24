const mongoose = require('mongoose');

const familyMemberSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
    },
    permissions: [
      {
        accountId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Account',
        },
        access: {
          type: String,
          enum: ['read', 'write'],
          default: 'read',
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('FamilyMember', familyMemberSchema);
