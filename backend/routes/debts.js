const express = require('express');
const { Debt, ActivityLog } = require('../models');
const { authenticate } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/groupMember');
const { processNewDebt, reverseDebt, simplifyDebts } = require('../utils/debtEngine');

const router = express.Router({ mergeParams: true });

// GET /groups/:group_id/debts
router.get('/', authenticate, requireGroupMember, async (req, res) => {
  try {
    const debts = await Debt.findAll({ where: { group_id: req.group.id } });
    return res.status(200).json(debts.map(d => ({
      id: d.id,
      group: d.group_id,
      from_user: d.from_user,
      to_user: d.to_user,
      amount: d.amount,
    })));
  } catch (err) {
    console.error('List debts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /groups/:group_id/debts/:from_user/:to_user
router.get('/:from_user/:to_user', authenticate, requireGroupMember, async (req, res) => {
  try {
    const debt = await Debt.findOne({
      where: {
        group_id: req.group.id,
        from_user: req.params.from_user,
        to_user: req.params.to_user,
      },
    });

    if (!debt) return res.status(200).json(null);

    return res.status(200).json({
      id: debt.id,
      group: debt.group_id,
      from_user: debt.from_user,
      to_user: debt.to_user,
      amount: debt.amount,
    });
  } catch (err) {
    console.error('Get debt error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /groups/:group_id/debts/:from_user/:to_user
router.delete('/:from_user/:to_user', authenticate, requireGroupMember, async (req, res) => {
  try {
    const debt = await Debt.findOne({
      where: {
        group_id: req.group.id,
        from_user: req.params.from_user,
        to_user: req.params.to_user,
      },
    });

    if (debt) {
      await debt.destroy();
      await simplifyDebts(req.group.id);
    }

    return res.status(200).json(`Debt from '${req.params.from_user}' to '${req.params.to_user}' deleted successfully.`);
  } catch (err) {
    console.error('Delete debt error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /groups/:group_id/debts/add
router.post('/add', authenticate, requireGroupMember, async (req, res) => {
  try {
    const { from, to, amount } = req.body;

    await processNewDebt(req.group.id, from, to, amount);
    await simplifyDebts(req.group.id);

    return res.status(201).json('Debt added successfully.');
  } catch (err) {
    console.error('Add debt error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /groups/:group_id/debts/settle
router.post('/settle', authenticate, requireGroupMember, async (req, res) => {
  try {
    let { from, to, amount } = req.body;

    // Parse amount: if string, convert from rupees to cents
    if (typeof amount === 'string') {
      amount = Math.round(parseFloat(amount) * 100);
    }

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0.' });
    }

    await reverseDebt(req.group.id, from, to, amount);
    await simplifyDebts(req.group.id);

    // Log activity
    const amountStr = (amount / 100).toFixed(2);
    await ActivityLog.create({
      group_id: req.group.id,
      user: req.user.username,
      action: 'settlement',
      description: `${from} paid ${to} ${amountStr}`,
    });

    return res.status(200).json('Settlement recorded successfully.');
  } catch (err) {
    console.error('Settle debt error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
