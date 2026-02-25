const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getWealthDashboard } = require('../controllers/wealthController');

router.use(protect);
router.get('/dashboard', getWealthDashboard);

module.exports = router;
