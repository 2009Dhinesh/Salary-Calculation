const User = require('../models/User');
const Account = require('../models/Account');

/**
 * Gets all accounts shared with a user along with their access levels.
 * @param {string} userId - ID of the user searching for shared accounts
 * @returns {Array} List of objects { accountId, canView, canEdit, ownerName }
 */
const getSharedAccountsInfo = async (userId) => {
  const owners = await User.find({
    'familyMembers.userId': userId,
    'familyMembers.permissions.accessType': { $in: ['all', 'custom'] }
  }).select('_id name familyMembers');

  const sharedInfo = [];
  for (const owner of owners) {
    const memberEntry = owner.familyMembers.find(m => m.userId && m.userId.toString() === userId.toString());
    if (!memberEntry) continue;

    if (memberEntry.permissions.accessType === 'all') {
      const accounts = await Account.find({ user: owner._id, isArchived: false }).select('_id');
      accounts.forEach(acc => {
        sharedInfo.push({
          accountId: acc._id.toString(),
          canView: true,
          canEdit: true, // 'all' access implies write
          ownerName: owner.name
        });
      });
    } else if (memberEntry.permissions.accessType === 'custom') {
      memberEntry.permissions.accounts.forEach(accPerm => {
        if (accPerm.canView) {
          sharedInfo.push({
            accountId: accPerm.accountId.toString(),
            canView: true,
            canEdit: accPerm.canEdit,
            ownerName: owner.name
          });
        }
      });
    }
  }
  return sharedInfo;
};

/**
 * Checks if a user has specific access to an account.
 * @param {string} userId - User ID to check
 * @param {string} accountId - Account ID to check
 * @param {string} permissionType - 'view' or 'edit'
 * @returns {Object} { allowed: boolean, account: object, canEdit: boolean }
 */
const checkAccountAccess = async (userId, accountId, permissionType = 'view') => {
  const account = await Account.findById(accountId);
  if (!account) return { allowed: false, status: 404, message: 'Account not found' };

  // Owner always has access
  if (account.user.toString() === userId.toString()) {
    return { allowed: true, account, canEdit: true };
  }

  // Check family share
  const owner = await User.findById(account.user);
  if (!owner) return { allowed: false, status: 404, message: 'Owner not found' };

  const memberEntry = owner.familyMembers.find(m => m.userId && m.userId.toString() === userId.toString());
  if (!memberEntry) return { allowed: false, status: 403, message: 'No access to this account' };

  if (memberEntry.permissions.accessType === 'all') {
    return { allowed: true, account, canEdit: true, ownerName: owner.name };
  }

  if (memberEntry.permissions.accessType === 'custom') {
    const accPerm = memberEntry.permissions.accounts.find(a => a.accountId.toString() === accountId.toString());
    if (accPerm) {
      if (permissionType === 'view' && accPerm.canView) {
        return { allowed: true, account, canEdit: accPerm.canEdit, ownerName: owner.name };
      }
      if (permissionType === 'edit' && accPerm.canEdit) {
        return { allowed: true, account, canEdit: true, ownerName: owner.name };
      }
    }
  }

  return { allowed: false, status: 403, message: `No ${permissionType} permission for this account` };
};

module.exports = {
  getSharedAccountsInfo,
  checkAccountAccess
};
