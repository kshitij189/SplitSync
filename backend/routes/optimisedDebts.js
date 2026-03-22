const express = require('express');
const { OptimisedDebt } = require('../models');
const { authenticate } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/groupMember');

const router = express.Router({ mergeParams: true });

// GET /groups/:group_id/optimisedDebts
router.get('/', authenticate, requireGroupMember, async (req, res) => {
  try {
    const debts = await OptimisedDebt.findAll({ where: { group_id: req.group.id } });
    return res.status(200).json(debts.map(d => ({
      id: d.id,
      group: d.group_id,
      from_user: d.from_user,
      to_user: d.to_user,
      amount: d.amount,
    })));
  } catch (err) {
    console.error('List optimised debts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
