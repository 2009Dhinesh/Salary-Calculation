const PaymentMethod = require('../models/PaymentMethod');

// @desc    Get all payment methods
// @route   GET /api/payment-methods
// @access  Private
const getPaymentMethods = async (req, res, next) => {
  try {
    const methods = await PaymentMethod.find({ user: req.user._id }).sort({ isDefault: -1, name: 1 });
    res.json({ success: true, methods });
  } catch (error) {
    next(error);
  }
};

// @desc    Create payment method
// @route   POST /api/payment-methods
// @access  Private
const createPaymentMethod = async (req, res, next) => {
  try {
    const method = await PaymentMethod.create({ ...req.body, user: req.user._id });
    res.status(201).json({ success: true, message: 'Payment method created', method });
  } catch (error) {
    next(error);
  }
};

// @desc    Update payment method
// @route   PUT /api/payment-methods/:id
// @access  Private
const updatePaymentMethod = async (req, res, next) => {
  try {
    const method = await PaymentMethod.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!method) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    res.json({ success: true, message: 'Payment method updated', method });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete payment method
// @route   DELETE /api/payment-methods/:id
// @access  Private
const deletePaymentMethod = async (req, res, next) => {
  try {
    const method = await PaymentMethod.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
      isDefault: false,
    });

    if (!method) {
      return res.status(404).json({ success: false, message: 'Payment method not found or cannot delete default' });
    }

    res.json({ success: true, message: 'Payment method deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
