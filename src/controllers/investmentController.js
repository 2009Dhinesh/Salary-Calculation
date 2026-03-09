const Investment = require('../models/Investment');

// @desc    Get all investments
// @route   GET /api/investments
const getInvestments = async (req, res, next) => {
  try {
    const investments = await Investment.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, count: investments.length, investments });
  } catch (error) {
    next(error);
  }
};

// @desc    Add new investment
// @route   POST /api/investments
const addInvestment = async (req, res, next) => {
  try {
    req.body.user = req.user._id;
    const investment = await Investment.create(req.body);
    res.status(201).json({ success: true, investment });
  } catch (error) {
    next(error);
  }
};

// @desc    Update investment (e.g. current price)
// @route   PUT /api/investments/:id
const updateInvestment = async (req, res, next) => {
  try {
    let investment = await Investment.findById(req.params.id);
    if (!investment) return res.status(404).json({ success: false, message: 'Investment not found' });
    if (investment.user.toString() !== req.user._id.toString()) return res.status(401).json({ success: false, message: 'Not authorized' });

    investment = await Investment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, investment });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete investment
// @route   DELETE /api/investments/:id
const deleteInvestment = async (req, res, next) => {
  try {
    const investment = await Investment.findById(req.params.id);
    if (!investment) return res.status(404).json({ success: false, message: 'Investment not found' });
    if (investment.user.toString() !== req.user._id.toString()) return res.status(401).json({ success: false, message: 'Not authorized' });

    await investment.remove();
    res.json({ success: true, message: 'Investment removed' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getInvestments, addInvestment, updateInvestment, deleteInvestment };
