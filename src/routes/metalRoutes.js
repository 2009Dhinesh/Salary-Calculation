const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getMetalPrices, getRateHistory, getMetalAssets,
  addMetalAsset, updateMetalAsset, deleteMetalAsset, metalCalculator,
} = require('../controllers/metalController');

router.use(protect);
router.get('/prices', getMetalPrices);
router.get('/history', getRateHistory);
router.get('/calculate', metalCalculator);
router.route('/').get(getMetalAssets).post(addMetalAsset);
router.route('/:id').put(updateMetalAsset).delete(deleteMetalAsset);

module.exports = router;
