const express = require('express');
const { getInsights } = require('../controllers/insightsController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/').get(getInsights);

module.exports = router;
