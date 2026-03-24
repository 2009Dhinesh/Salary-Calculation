const User = require('../models/User');
const Category = require('../models/Category');
const Account = require('../models/Account');
const PaymentMethod = require('../models/PaymentMethod');
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
};

// Default categories to seed for new users
const defaultCategories = [
  // Expense categories
  { name: 'Food & Dining', type: 'expense', icon: '🍽️', color: '#FF6B6B' },
  { name: 'Transportation', type: 'expense', icon: '🚗', color: '#4ECDC4' },
  { name: 'Shopping', type: 'expense', icon: '🛍️', color: '#FFE66D' },
  { name: 'Entertainment', type: 'expense', icon: '🎬', color: '#A8E6CF' },
  { name: 'Health & Medical', type: 'expense', icon: '🏥', color: '#F8B500' },
  { name: 'Utilities', type: 'expense', icon: '⚡', color: '#6C63FF' },
  { name: 'Education', type: 'expense', icon: '📚', color: '#FF8B94' },
  { name: 'Housing & Rent', type: 'expense', icon: '🏠', color: '#98DDCA' },
  { name: 'Personal Care', type: 'expense', icon: '💄', color: '#D4A5A5' },
  { name: 'Investments', type: 'expense', icon: '📈', color: '#85C1E9' },
  { name: 'Travel', type: 'expense', icon: '✈️', color: '#82E0AA' },
  { name: 'Other Expense', type: 'expense', icon: '💸', color: '#BDC3C7' },
  // Income categories
  { name: 'Salary', type: 'income', icon: '💼', color: '#27AE60' },
  { name: 'Freelance', type: 'income', icon: '💻', color: '#2ECC71' },
  { name: 'Business', type: 'income', icon: '🏢', color: '#16A085' },
  { name: 'Investment', type: 'income', icon: '📊', color: '#1ABC9C' },
  { name: 'Rental Income', type: 'income', icon: '🏘️', color: '#3498DB' },
  { name: 'Gift', type: 'income', icon: '🎁', color: '#9B59B6' },
  { name: 'Other Income', type: 'income', icon: '💵', color: '#2C3E50' },
];

// Default payment methods to seed for new users
const defaultPaymentMethods = [
  { name: 'Bank', icon: '🏦', color: '#16A085' },
  { name: 'Cash', icon: '💵', color: '#27AE60' },
  { name: 'Card', icon: '💳', color: '#3498DB' },
  { name: 'UPI', icon: '📱', color: '#6C63FF' },
];

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const user = await User.create({ name, email, password });

    // Seed default categories for new user
    const categoriesWithUser = defaultCategories.map((cat) => ({
      ...cat,
      user: user._id,
      isDefault: true,
    }));
    await Category.insertMany(categoriesWithUser);

    // Seed default payment methods for new user
    const paymentMethodsWithUser = defaultPaymentMethods.map((pm) => ({
      ...pm,
      user: user._id,
      isDefault: true,
    }));
    await PaymentMethod.insertMany(paymentMethodsWithUser);

    // Create default account for new user
    await Account.create({
      user: user._id,
      name: 'Cash',
      type: 'cash',
      balance: 0,
      icon: '💵',
      color: '#27AE60',
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        currency: user.currency,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        currency: user.currency,
        avatar: user.avatar,
        expectedIncomes: user.expectedIncomes,
        notifications: user.notifications,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const { name, currency, expectedIncomes, notifications, avatar } = req.body;

    if (avatar) {
      console.log(`[Profile Update] Received avatar string of length: ${avatar.length}`);
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, currency, expectedIncomes, notifications, avatar },
      { new: true, runValidators: true }
    );

    res.json({ success: true, message: 'Profile updated', user });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from current password' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password - Send OTP
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with this email' });
    }

    // Generate 4 digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    const message = `Your password reset OTP is ${otp}. It will expire in 10 minutes.`;

    try {
      const sendEmail = require('../utils/sendEmail');
      console.log(`[OTP] Attempting to send OTP email to ${user.email} in ${process.env.NODE_ENV} mode`);
      await sendEmail({
        email: user.email,
        subject: 'Password Reset OTP',
        message,
        html: `<h3>Password Reset OTP</h3><p>Your password reset OTP is <b>${otp}</b>. It will expire in 10 minutes.</p>`,
      });
      res.json({ success: true, message: 'OTP sent to email' });
    } catch (err) {
      console.error('❌ [OTP] Email send failed:', err.message);
      
      // For development, if email fails, we still return success but log OTP to console
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        console.log('-----------------------------------------');
        console.log(`🔑 DEVELOPMENT OTP: ${otp} (for email: ${user.email})`);
        console.log('-----------------------------------------');

        return res.json({ 
          success: true, 
          message: 'OTP generated (Email service failed, check server console)', 
        });
      }
      res.status(500).json({ success: false, message: `Email could not be sent: ${err.message}` });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password using OTP
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({
      email,
      resetPasswordOTP: otp,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    user.password = newPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, getMe, updateProfile, changePassword, forgotPassword, resetPassword };
