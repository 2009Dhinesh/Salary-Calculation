const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getGoldPrice, getGoldAssets, addGoldAsset, updateGoldAsset, deleteGoldAsset, goldCalculator } = require('../controllers/goldController');

router.use(protect);
router.get('/price', getGoldPrice);
router.get('/calculate', goldCalculator);
router.route('/').get(getGoldAssets).post(addGoldAsset);
router.route('/:id').put(updateGoldAsset).delete(deleteGoldAsset);

module.exports = router;
