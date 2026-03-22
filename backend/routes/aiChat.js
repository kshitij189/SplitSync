const express = require('express');
const { UserDebt, Expense, OptimisedDebt } = require('../models');
const { authenticate } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/groupMember');
const { getBotResponse } = require('../utils/splitbot');

const router = express.Router({ mergeParams: true });

// POST /groups/:group_id/ai-chat
router.post('/', authenticate, requireGroupMember, async (req, res) => {
  try {
    const { message } = req.body;

    // Gather context
    const userDebts = await UserDebt.findAll({ where: { group_id: req.group.id } });
    const balances = {};
    for (const ud of userDebts) {
      balances[ud.username] = ud.net_debt;
    }

    const optimisedDebts = await OptimisedDebt.findAll({ where: { group_id: req.group.id } });
    const settlements = optimisedDebts.map(d => ({
      from: d.from_user,
      to: d.to_user,
      amount: d.amount,
    }));

    const recentExpenses = await Expense.findAll({
      where: { group_id: req.group.id },
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    const expensesList = recentExpenses.map(e => ({
      title: e.title,
      amount: e.amount,
      lender: e.lender,
      date: e.created_at ? new Date(e.created_at).toISOString().split('T')[0] : '',
    }));

    const reply = await getBotResponse(message, {
      balances,
      settlements,
      recent_expenses: expensesList,
    });

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('AI chat error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
