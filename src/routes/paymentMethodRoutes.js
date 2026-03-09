const express = require('express');
const router = express.Router();
const {
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} = require('../controllers/paymentMethodController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getPaymentMethods)
  .post(createPaymentMethod);

router.route('/:id')
  .put(updatePaymentMethod)
  .delete(deletePaymentMethod);

module.exports = router;
