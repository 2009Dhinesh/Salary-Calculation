const LandAsset = require('../models/LandAsset');

// @desc    Get all land assets
// @route   GET /api/land
// @access  Private
const getLandAssets = async (req, res, next) => {
  try {
    const assets = await LandAsset.find({ user: req.user._id })
      .populate('account', 'name icon color bankName bankLogo')
      .sort({ purchaseDate: -1 });

    const enriched = assets.map(a => {
      const doc = a.toObject();
      doc.appreciation = doc.currentValue - a.purchasePrice;
      doc.appreciationPercent = a.purchasePrice > 0
        ? (((doc.currentValue - a.purchasePrice) / a.purchasePrice) * 100).toFixed(1)
        : 0;
      if (a.area > 0) {
        doc.pricePerUnit = Math.round(a.purchasePrice / a.area);
        doc.currentPricePerUnit = a.currentValue > 0 ? Math.round(a.currentValue / a.area) : 0;
      }
      return doc;
    });

    const totalInvested = assets.reduce((s, a) => s + a.purchasePrice, 0);
    const totalCurrentValue = assets.reduce((s, a) => s + (a.currentValue || a.purchasePrice), 0);

    res.json({
      success: true,
      assets: enriched,
      summary: {
        totalInvested,
        totalCurrentValue,
        totalAppreciation: totalCurrentValue - totalInvested,
        appreciationPercent: totalInvested > 0 ? (((totalCurrentValue - totalInvested) / totalInvested) * 100).toFixed(1) : 0,
        count: assets.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add land asset
// @route   POST /api/land
// @access  Private
const addLandAsset = async (req, res, next) => {
  try {
    const body = { ...req.body, user: req.user._id };
    if (!body.currentValue) body.currentValue = body.purchasePrice;
    const asset = await LandAsset.create(body);
    await asset.populate('account', 'name icon color bankName bankLogo');
    res.status(201).json({ success: true, message: 'Property added', asset });
  } catch (error) {
    next(error);
  }
};

// @desc    Update land asset
// @route   PUT /api/land/:id
// @access  Private
const updateLandAsset = async (req, res, next) => {
  try {
    const asset = await LandAsset.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    ).populate('account', 'name icon color bankName bankLogo');
    if (!asset) return res.status(404).json({ success: false, message: 'Property not found' });
    res.json({ success: true, message: 'Property updated', asset });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete land asset
// @route   DELETE /api/land/:id
// @access  Private
const deleteLandAsset = async (req, res, next) => {
  try {
    const asset = await LandAsset.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!asset) return res.status(404).json({ success: false, message: 'Property not found' });
    res.json({ success: true, message: 'Property deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getLandAssets, addLandAsset, updateLandAsset, deleteLandAsset };
