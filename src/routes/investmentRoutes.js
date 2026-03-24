const express = require('express');
const { getInvestments, addInvestment, updateInvestment, deleteInvestment } = require('../controllers/investmentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getInvestments)
  .post(addInvestment);

router.route('/:id')
  .put(updateInvestment)
  .delete(deleteInvestment);

module.exports = router;
