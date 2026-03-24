const express = require('express');
const router = express.Router();
const familyController = require('../controllers/familyController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/report', familyController.getFamilyReport);
router.post('/', familyController.createFamily);
router.post('/join', familyController.requestToJoin);
router.get('/requests', familyController.getJoinRequests);
router.put('/requests/:id', familyController.handleJoinRequest);
router.get('/members', familyController.getFamilyMembers);
router.get('/members/:id', familyController.getMemberDetails);

// --- New P2P Routes ---
router.get('/code', familyController.getMyFamilyCode);
router.get('/search/:code', familyController.searchUserByCode);
router.post('/connect', familyController.connectMember);
router.get('/connect/requests', familyController.getConnectionRequests);
router.put('/connect/requests/:id', familyController.handleConnectionRequest);
router.put('/permissions/:id', familyController.updatePermissions);
router.delete('/member/:id', familyController.deleteMember);

module.exports = router;
