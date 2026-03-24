const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const mongoose = require('mongoose');
const crypto = require('crypto');
const ConnectionRequest = require('../models/ConnectionRequest');
const FamilyGroup = require('../models/FamilyGroup');
const FamilyMember = require('../models/FamilyMember');
const JoinRequest = require('../models/JoinRequest');

// @desc    Create a family group
// @route   POST /api/family
// @access  Private
const createFamily = async (req, res, next) => {
  try {
    const { name, accountIds } = req.body;

    // Check if user is already an admin of a family (one user, one family admin for now)
    const existingAdmin = await FamilyMember.findOne({ userId: req.user._id, role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: 'You are already an admin of a family group.' });
    }

    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    const family = await FamilyGroup.create({
      name,
      adminId: req.user._id,
      members: [req.user._id],
      inviteCode,
    });

    // Create FamilyMember entry for admin
    await FamilyMember.create({
      userId: req.user._id,
      familyId: family._id,
      role: 'admin',
      permissions: accountIds.map(id => ({ accountId: id, access: 'write' }))
    });

    // Link selected accounts
    if (accountIds && accountIds.length > 0) {
      await Account.updateMany(
        { _id: { $in: accountIds }, user: req.user._id },
        { familyId: family._id }
      );
    }

    res.status(201).json({ success: true, family });
  } catch (error) {
    next(error);
  }
};

// @desc    Request to join a family
// @route   POST /api/family/join
// @access  Private
const requestToJoin = async (req, res, next) => {
  try {
    const { inviteCode } = req.body;

    const family = await FamilyGroup.findOne({ inviteCode });
    if (!family) {
      return res.status(404).json({ success: false, message: 'Invalid family code.' });
    }

    // Check if already a member
    const existingMember = await FamilyMember.findOne({ userId: req.user._id, familyId: family._id });
    if (existingMember) {
      return res.status(400).json({ success: false, message: 'You are already a member of this family.' });
    }

    // Check for pending request
    const existingRequest = await JoinRequest.findOne({ userId: req.user._id, familyId: family._id, status: 'pending' });
    if (existingRequest) {
      return res.status(400).json({ success: false, message: 'Join request already sent and pending.' });
    }

    await JoinRequest.create({
      userId: req.user._id,
      familyId: family._id,
      status: 'pending'
    });

    res.json({ success: true, message: 'Join request sent to family admin.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get join requests for admin
// @route   GET /api/family/requests
// @access  Private
const getJoinRequests = async (req, res, next) => {
  try {
    const adminDepts = await FamilyMember.find({ userId: req.user._id, role: 'admin' });
    const familyIds = adminDepts.map(d => d.familyId);

    const requests = await JoinRequest.find({ familyId: { $in: familyIds }, status: 'pending' })
      .populate('userId', 'name email')
      .populate('familyId', 'name');

    res.json({ success: true, requests });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve/Reject join request
// @route   PUT /api/family/requests/:id
// @access  Private
const handleJoinRequest = async (req, res, next) => {
  try {
    const { status, accountPermissions } = req.body; // status: approved/rejected, accountPermissions: [{ accountId, access }]
    
    const request = await JoinRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    // Verify req.user is admin of that family
    const isAdmin = await FamilyMember.findOne({ userId: req.user._id, familyId: request.familyId, role: 'admin' });
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Only family admins can approve requests.' });
    }

    if (status === 'approved') {
      request.status = 'approved';
      await request.save();

      // Add to members in FamilyGroup
      await FamilyGroup.findByIdAndUpdate(request.familyId, {
        $addToSet: { members: request.userId }
      });

      // Create FamilyMember entry
      await FamilyMember.create({
        userId: request.userId,
        familyId: request.familyId,
        role: 'member',
        permissions: accountPermissions
      });
    } else {
      request.status = 'rejected';
      await request.save();
    }

    res.json({ success: true, message: `Request ${status}.` });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all family members (connected users)
// @route   GET /api/family/members
// @access  Private
const getFamilyMembers = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'familyMembers.userId',
      select: 'name email avatar'
    }).populate({
      path: 'familyMembers.permissions.accounts.accountId',
      select: 'name color icon'
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // To provide a complete picture, we also need to see what these members have shared WITH the user
    const connectedUserIds = user.familyMembers.map(m => m.userId?._id).filter(id => id);

    const others = await User.find({
      _id: { $in: connectedUserIds },
      'familyMembers.userId': req.user._id
    }).select('familyMembers').populate({
      path: 'familyMembers.permissions.accounts.accountId',
      select: 'name color icon'
    });

    // Create a map of incoming permissions for easy lookup
    const incomingPermissionsMap = {};
    others.forEach(other => {
      const myEntryInOther = other.familyMembers.find(m => m.userId && m.userId.toString() === req.user._id.toString());
      if (myEntryInOther) {
        incomingPermissionsMap[other._id.toString()] = myEntryInOther.permissions;
      }
    });

    // Merge incoming permissions into the member list
    const members = user.familyMembers.map(m => {
      if (!m.userId) return m;
      const memberObj = m.toObject();
      memberObj.receivedPermissions = incomingPermissionsMap[m.userId._id.toString()] || { accessType: 'none', accounts: [] };
      return memberObj;
    });

    res.json({ 
      success: true, 
      members,
      familyCode: user.familyCode
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get specific member details and transactions
// @route   GET /api/family/members/:id
// @access  Private
const getMemberDetails = async (req, res, next) => {
  try {
    const { id: memberId } = req.params;
    
    // 1. Verify connection
    const self = await User.findById(req.user._id);
    const memberEntry = self.familyMembers.find(m => m.userId.toString() === memberId);
    
    if (!memberEntry) {
      return res.status(403).json({ success: false, message: 'You are not connected to this member' });
    }

    // 2. Fetch target user's basic info
    const targetUser = await User.findById(memberId).select('name email avatar');

    // 3. Fetch transactions by this user in accounts WE have permission for
    const target = await User.findById(memberId).populate({
      path: 'familyMembers.permissions.accounts.accountId',
      select: 'name icon color'
    });
    const myPermissionsInTarget = target.familyMembers.find(m => m.userId.toString() === req.user._id.toString())?.permissions;

    if (!myPermissionsInTarget) {
       return res.status(403).json({ success: false, message: 'This member has not shared any access with you.' });
    }

    let allowedAccountIds = [];
    if (myPermissionsInTarget.accessType === 'all') {
      const targetAccounts = await Account.find({ user: memberId, isArchived: false });
      allowedAccountIds = targetAccounts.map(a => a._id);
    } else {
      allowedAccountIds = myPermissionsInTarget.accounts
        .filter(a => a.canView)
        .map(a => a.accountId);
    }

    const transactions = await Transaction.find({
      user: memberId,
      account: { $in: allowedAccountIds }
    })
    .sort({ date: -1 })
    .limit(50)
    .populate('account', 'name icon color')
    .populate('category', 'name icon color');

    res.json({
      success: true,
      member: targetUser,
      permissions: myPermissionsInTarget,
      transactions
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get family-wide report data
// @route   GET /api/family/report
// @access  Private
// @desc    Get family-wide report data (aggregated from shared accounts)
// @route   GET /api/family/report
// @access  Private
const getFamilyReport = async (req, res, next) => {
  try {
    const self = await User.findById(req.user._id);
    
    // 1. Identify all accounts shared WITH me by others
    // We need to look at OTHER users where we are in their familyMembers array
    const othersSharingWithMe = await User.find({
      'familyMembers.userId': req.user._id
    });

    let sharedAccountIds = [];

    for (const other of othersSharingWithMe) {
      const selfMemberEntry = other.familyMembers.find(m => m.userId && m.userId.toString() === req.user._id.toString());
      if (!selfMemberEntry || !selfMemberEntry.permissions) continue;
      
      const myPerms = selfMemberEntry.permissions;
      
      if (myPerms.accessType === 'all') {
        const otherAccounts = await Account.find({ user: other._id, isArchived: false });
        sharedAccountIds.push(...otherAccounts.map(a => a._id));
      } else {
        const allowed = myPerms.accounts.filter(a => a.canView).map(a => a.accountId);
        sharedAccountIds.push(...allowed);
      }
    }

    // Add my own accounts to the report
    const myAccounts = await Account.find({ user: req.user._id, isArchived: false });
    sharedAccountIds.push(...myAccounts.map(a => a._id));

    // Remove duplicates
    sharedAccountIds = [...new Set(sharedAccountIds.map(id => id.toString()))];

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    // 2. Aggregate Totals (Month)
    const stats = await Transaction.aggregate([
      { 
        $match: { 
          account: { $in: sharedAccountIds.map(id => new mongoose.Types.ObjectId(id)) },
          date: { $gte: firstDay }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' }
        }
      }
    ]);

    const income = stats.find(s => s._id === 'income')?.total || 0;
    const expense = stats.find(s => s._id === 'expense')?.total || 0;

    // 3. Category Breakdown (Spending only, Month)
    const categoryBreakdown = await Transaction.aggregate([
      { 
        $match: { 
          account: { $in: sharedAccountIds.map(id => new mongoose.Types.ObjectId(id)) },
          type: 'expense',
          date: { $gte: firstDay }
        }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' }
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      { $sort: { total: -1 } }
    ]);

    // 4. Member Contributions (Spending, Month) - Detailed with Accounts
    const memberContributions = await Transaction.aggregate([
      { 
        $match: { 
          account: { $in: sharedAccountIds.map(id => new mongoose.Types.ObjectId(id)) },
          type: 'expense',
          date: { $gte: firstDay }
        }
      },
      {
        $group: {
          _id: { 
            user: { $toObjectId: "$user" }, 
            account: { $toObjectId: "$account" } 
          },
          total: { $sum: '$amount' }
        }
      },
      {
        $lookup: {
          from: 'accounts',
          localField: '_id.account',
          foreignField: '_id',
          as: 'accountInfo'
        }
      },
      { $unwind: '$accountInfo' },
      {
        $group: {
          _id: '$_id.user',
          total: { $sum: '$total' },
          accountsBreakdown: {
            $push: {
              name: '$accountInfo.name',
              total: '$total'
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $sort: { total: -1 } }
    ]);

    // 5. Shared Account Balances
    const accounts = await Account.find({ _id: { $in: sharedAccountIds } });
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    res.json({
      success: true,
      report: {
        timeframe: 'Current Month',
        income,
        expense,
        netFlow: income - expense,
        totalBalance,
        categoryBreakdown,
        memberContributions,
        sharedAccountCount: sharedAccountIds.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// --- P2P FAMILY MODEL CONTROLLERS ---

// @desc    Search user by family code
// @route   GET /api/family/search/:code
// @access  Private
const searchUserByCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    
    // Find user by code, exclude requester
    const user = await User.findOne({ 
      familyCode: code, 
      _id: { $ne: req.user._id } 
    }).select('name email avatar');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with this code' });
    }

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// @desc    Connect to a member (Mutual)
// @route   POST /api/family/connect
// @access  Private
const connectMember = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    
    if (targetUserId.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot connect with yourself' });
    }

    const self = await User.findById(req.user._id);
    const target = await User.findById(targetUserId);

    if (!target) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }

    // Check if already connected
    const isAlreadyConnected = self.familyMembers.some(m => m.userId && m.userId.toString() === targetUserId.toString());
    if (isAlreadyConnected) {
      return res.status(400).json({ success: false, message: 'Already connected to this member' });
    }

    // Check for existing pending request
    const existingRequest = await ConnectionRequest.findOne({
      sender: req.user._id,
      receiver: targetUserId,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({ success: false, message: 'Connection request already sent' });
    }

    // Create request
    await ConnectionRequest.create({
      sender: req.user._id,
      receiver: targetUserId
    });

    res.json({ success: true, message: 'Connection request sent' });
  } catch (err) {
    next(err);
  }
};

// @desc    Get pending connection requests
// @route   GET /api/family/connect/requests
// @access  Private
const getConnectionRequests = async (req, res, next) => {
  try {
    const requests = await ConnectionRequest.find({
      receiver: req.user._id,
      status: 'pending'
    }).populate('sender', 'name email avatar');

    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
};

// @desc    Handle (Accept/Reject) connection request
// @route   PUT /api/family/connect/requests/:id
// @access  Private
const handleConnectionRequest = async (req, res, next) => {
  try {
    const { id: requestId } = req.params;
    const { status } = req.body; // 'accepted' or 'rejected'

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const request = await ConnectionRequest.findById(requestId);
    if (!request || request.receiver.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request already handled' });
    }

    request.status = status;
    await request.save();

    if (status === 'accepted') {
      const self = await User.findById(req.user._id);
      const sender = await User.findById(request.sender);

      if (!sender) return res.status(404).json({ success: false, message: 'Sender not found' });

      // Check if already connected (paranoia check)
      const alreadyConnected = self.familyMembers.some(m => m.userId && m.userId.toString() === request.sender.toString());
      if (!alreadyConnected) {
        // Add sender to self
        self.familyMembers.push({
          userId: request.sender,
          permissions: { accessType: 'custom', accounts: [] }
        });

        // Add self to sender (mutual)
        sender.familyMembers.push({
          userId: req.user._id,
          permissions: { accessType: 'custom', accounts: [] }
        });

        await Promise.all([self.save(), sender.save()]);
      }
    }

    res.json({ success: true, message: `Request ${status}` });
  } catch (err) {
    next(err);
  }
};

// @desc    Update permissions for a member
// @route   PUT /api/family/permissions/:id
// @access  Private
const updatePermissions = async (req, res, next) => {
  try {
    const { id: targetUserId } = req.params;
    const { accessType, accounts } = req.body; // accounts: [{ accountId, canView, canEdit }]

    const user = await User.findById(req.user._id);
    
    const memberIndex = user.familyMembers.findIndex(m => m.userId.toString() === targetUserId);
    if (memberIndex === -1) {
      return res.status(404).json({ success: false, message: 'Member not found in your family' });
    }

    user.familyMembers[memberIndex].permissions = {
      accessType,
      accounts: accounts || []
    };

    await user.save();
    res.json({ success: true, message: 'Permissions updated successfully' });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete/Disconnect a member (Mutual)
// @route   DELETE /api/family/member/:id
// @access  Private
const deleteMember = async (req, res, next) => {
  try {
    const { id: targetUserId } = req.params;
    
    const self = await User.findById(req.user._id);
    const target = await User.findById(targetUserId);

    if (!self) return res.status(404).json({ success: false, message: 'User not found' });

    // Remove target from self
    self.familyMembers = self.familyMembers.filter(m => m.userId.toString() !== targetUserId);

    // Remove self from target (if target exists)
    if (target) {
      target.familyMembers = target.familyMembers.filter(m => m.userId.toString() !== req.user._id.toString());
      await target.save();
    }

    await self.save();

    res.json({ success: true, message: 'Member disconnected successfully' });
  } catch (err) {
    next(err);
  }
};

// @desc    Get my family code (generate if missing)
// @route   GET /api/family/code
// @access  Private
const getMyFamilyCode = async (req, res, next) => {
  try {
    let user = await User.findById(req.user._id);
    
    if (!user.familyCode) {
      // Generate a unique 8-digit code
      let code;
      let isUnique = false;
      while (!isUnique) {
        code = Math.floor(10000000 + Math.random() * 90000000).toString();
        const existing = await User.findOne({ familyCode: code });
        if (!existing) isUnique = true;
      }
      user.familyCode = code;
      await user.save();
    }

    res.json({ success: true, familyCode: user.familyCode });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createFamily,
  requestToJoin,
  getJoinRequests,
  handleJoinRequest,
  getFamilyMembers,
  getMemberDetails,
  getFamilyReport,
  // New P2P Controllers
  searchUserByCode,
  connectMember,
  getConnectionRequests,
  handleConnectionRequest,
  updatePermissions,
  getMyFamilyCode,
  deleteMember
};
