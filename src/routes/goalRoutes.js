const express = require('express');
const {
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  addFunds,
  withdrawFunds,
} = require('../controllers/goalController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getGoals)
  .post(createGoal);

router.route('/:id')
  .put(updateGoal)
  .delete(deleteGoal);

router.route('/:id/add-funds')
  .patch(addFunds);

router.route('/:id/withdraw-funds')
  .patch(withdrawFunds);

module.exports = router;
