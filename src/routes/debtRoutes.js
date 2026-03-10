const express = require('express');
const router = express.Router();
const { getDebts, getDebt, createDebt, addRepayment, deleteDebt, getDebtSummary } = require('../controllers/debtController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/summary', getDebtSummary);
router.get('/', getDebts);
router.get('/:id', getDebt);
router.post('/', createDebt);
router.post('/:id/repay', addRepayment);
router.delete('/:id', deleteDebt);

module.exports = router;
