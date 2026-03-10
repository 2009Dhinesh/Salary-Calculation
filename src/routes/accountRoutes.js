const express = require('express');
const router = express.Router();
const {
  getAccounts,
  getArchivedAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  archiveAccount,
  unarchiveAccount,
} = require('../controllers/accountController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/archived', getArchivedAccounts);
router.get('/', getAccounts);
router.get('/:id', getAccount);
router.post('/', createAccount);
console.log('DEBUG: Hit PUT /:id/archive');
router.put('/:id/archive', (req, res, next) => {
  console.log('DEBUG: Executing archiveAccount for ID:', req.params.id);
  archiveAccount(req, res, next);
});
router.put('/:id/unarchive', unarchiveAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

router.use((req, res) => {
  if (req.method === 'PUT') {
    console.log('❌ MISSED PUT ROUTE:', req.originalUrl, 'Method:', req.method);
  }
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found on Account Router` });
});

module.exports = router;
