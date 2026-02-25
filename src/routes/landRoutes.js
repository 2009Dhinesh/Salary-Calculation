const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getLandAssets, addLandAsset, updateLandAsset, deleteLandAsset } = require('../controllers/landController');

router.use(protect);
router.route('/').get(getLandAssets).post(addLandAsset);
router.route('/:id').put(updateLandAsset).delete(deleteLandAsset);

module.exports = router;
