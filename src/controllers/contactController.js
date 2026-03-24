const Contact = require('../models/Contact');

// @desc    Get all contacts
// @route   GET /api/contacts
// @access  Private
const getContacts = async (req, res, next) => {
  try {
    const { search, relation } = req.query;
    const query = { user: req.user._id };

    if (relation) query.relation = relation;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const contacts = await Contact.find(query).sort({ name: 1 });
    res.json({ success: true, contacts });
  } catch (error) {
    next(error);
  }
};

// @desc    Create contact
// @route   POST /api/contacts
// @access  Private
const createContact = async (req, res, next) => {
  try {
    const contact = await Contact.create({ ...req.body, user: req.user._id });
    res.status(201).json({ success: true, message: 'Contact added', contact });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Contact with this name already exists' });
    }
    next(error);
  }
};

// @desc    Update contact
// @route   PUT /api/contacts/:id
// @access  Private
const updateContact = async (req, res, next) => {
  try {
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    res.json({ success: true, message: 'Contact updated', contact });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete contact
// @route   DELETE /api/contacts/:id
// @access  Private
const deleteContact = async (req, res, next) => {
  try {
    const Debt = require('../models/Debt');
    const debtCount = await Debt.countDocuments({ contact: req.params.id, user: req.user._id });
    if (debtCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete contact with existing debt records. Delete debts first.',
      });
    }

    const contact = await Contact.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getContacts, createContact, updateContact, deleteContact };
