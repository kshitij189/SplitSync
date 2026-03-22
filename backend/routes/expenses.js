const express = require('express');
const {
  Expense, ExpenseLender, ExpenseBorrower, ExpenseComment,
  ActivityLog, UserDebt, OptimisedDebt
} = require('../models');
const { authenticate } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/groupMember');
const { processMultiPayerDebt, reverseMultiPayerDebt, simplifyDebts } = require('../utils/debtEngine');
const { getBotResponse } = require('../utils/splitbot');

const router = express.Router({ mergeParams: true });

// Helper to parse lenders/borrowers from request (supports both array and object formats)
function parsePeople(data) {
  if (!data || !Array.isArray(data)) return [];
  return data.map(item => {
    if (Array.isArray(item)) {
      return [item[0].toLowerCase(), item[1]];
    }
    return [item.username.toLowerCase(), item.amount];
  });
}

// Helper to serialize an expense with lenders, borrowers, comments
async function serializeExpense(expense) {
  const lenders = await ExpenseLender.findAll({ where: { expense_id: expense.id } });
  const borrowers = await ExpenseBorrower.findAll({ where: { expense_id: expense.id } });
  const comments = await ExpenseComment.findAll({
    where: { expense_id: expense.id },
    order: [['created_at', 'ASC']],
  });

  return {
    id: expense.id,
    group: expense.group_id,
    title: expense.title,
    author: expense.author,
    lender: expense.lender,
    lenders: lenders.map(l => ({ username: l.username, amount: l.amount })),
    borrowers: borrowers.map(b => ({ username: b.username, amount: b.amount })),
    comments: comments.map(c => ({
      id: c.id,
      expense: c.expense_id,
      author: c.author,
      text: c.text,
      created_at: c.created_at,
    })),
    amount: expense.amount,
    created_at: expense.created_at,
  };
}

// GET /groups/:group_id/expenses
router.get('/', authenticate, requireGroupMember, async (req, res) => {
  try {
    const expenses = await Expense.findAll({
      where: { group_id: req.group.id },
      order: [['created_at', 'DESC']],
    });

    const result = await Promise.all(expenses.map(e => serializeExpense(e)));
    return res.status(200).json(result);
  } catch (err) {
    console.error('List expenses error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /groups/:group_id/expenses
router.post('/', authenticate, requireGroupMember, async (req, res) => {
  try {
    const { title, amount } = req.body;
    let lendersData = parsePeople(req.body.lenders);
    const borrowersData = parsePeople(req.body.borrowers);

    // Legacy single-lender fallback
    if (lendersData.length === 0 && req.body.lender) {
      lendersData = [[req.body.lender.toLowerCase(), amount]];
    }

    // Validate sums
    const lenderSum = lendersData.reduce((sum, [, amt]) => sum + amt, 0);
    const borrowerSum = borrowersData.reduce((sum, [, amt]) => sum + amt, 0);

    if (lenderSum !== amount || borrowerSum !== amount) {
      return res.status(400).json({ error: 'Lender or borrower amounts do not add up to the total amount.' });
    }

    const primaryLender = lendersData[0][0];

    const expense = await Expense.create({
      group_id: req.group.id,
      title,
      author: req.user.username,
      lender: primaryLender,
      amount,
    });

    // Create lender records
    for (const [username, amt] of lendersData) {
      await ExpenseLender.create({
        expense_id: expense.id,
        username,
        amount: amt,
      });
    }

    // Create borrower records
    for (const [username, amt] of borrowersData) {
      await ExpenseBorrower.create({
        expense_id: expense.id,
        username,
        amount: amt,
      });
    }

    // Process debts
    await processMultiPayerDebt(req.group.id, lendersData, borrowersData, amount);
    await simplifyDebts(req.group.id);

    // Log activity
    const amountStr = (amount / 100).toFixed(2);
    let desc = `Added expense '${title}' for ${amountStr}`;
    if (lendersData.length > 1) desc += ' (multi-payer)';

    await ActivityLog.create({
      group_id: req.group.id,
      user: req.user.username,
      action: 'expense_added',
      description: desc,
    });

    const result = await serializeExpense(expense);
    return res.status(201).json(result);
  } catch (err) {
    console.error('Create expense error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /groups/:group_id/expenses/:expense_id
router.get('/:expense_id', authenticate, requireGroupMember, async (req, res) => {
  try {
    const expense = await Expense.findOne({
      where: { id: req.params.expense_id, group_id: req.group.id },
    });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const result = await serializeExpense(expense);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Get expense error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /groups/:group_id/expenses/:expense_id
router.delete('/:expense_id', authenticate, requireGroupMember, async (req, res) => {
  try {
    const expense = await Expense.findOne({
      where: { id: req.params.expense_id, group_id: req.group.id },
    });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    // Get existing lenders and borrowers
    const lenders = await ExpenseLender.findAll({ where: { expense_id: expense.id } });
    const borrowers = await ExpenseBorrower.findAll({ where: { expense_id: expense.id } });

    const lendersData = lenders.map(l => [l.username, l.amount]);
    const borrowersData = borrowers.map(b => [b.username, b.amount]);

    // Reverse debts
    await reverseMultiPayerDebt(req.group.id, lendersData, borrowersData, expense.amount);

    // Delete expense (cascades to lenders, borrowers, comments via FK)
    await ExpenseComment.destroy({ where: { expense_id: expense.id } });
    await ExpenseLender.destroy({ where: { expense_id: expense.id } });
    await ExpenseBorrower.destroy({ where: { expense_id: expense.id } });
    await expense.destroy();

    await simplifyDebts(req.group.id);

    // Log activity
    await ActivityLog.create({
      group_id: req.group.id,
      user: req.user.username,
      action: 'expense_deleted',
      description: `Deleted expense '${expense.title}'`,
    });

    return res.status(200).json('Expense deleted successfully.');
  } catch (err) {
    console.error('Delete expense error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /groups/:group_id/expenses/:expense_id
router.put('/:expense_id', authenticate, requireGroupMember, async (req, res) => {
  try {
    const expense = await Expense.findOne({
      where: { id: req.params.expense_id, group_id: req.group.id },
    });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const { title, amount } = req.body;
    let newLendersData = parsePeople(req.body.lenders);
    const newBorrowersData = parsePeople(req.body.borrowers);

    if (newLendersData.length === 0 && req.body.lender) {
      newLendersData = [[req.body.lender.toLowerCase(), amount]];
    }

    // Validate sums
    const lenderSum = newLendersData.reduce((sum, [, amt]) => sum + amt, 0);
    const borrowerSum = newBorrowersData.reduce((sum, [, amt]) => sum + amt, 0);

    if (lenderSum !== amount || borrowerSum !== amount) {
      return res.status(400).json({ error: 'Lender or borrower amounts do not add up to the total amount.' });
    }

    // Reverse old debt
    const oldLenders = await ExpenseLender.findAll({ where: { expense_id: expense.id } });
    const oldBorrowers = await ExpenseBorrower.findAll({ where: { expense_id: expense.id } });
    const oldLendersData = oldLenders.map(l => [l.username, l.amount]);
    const oldBorrowersData = oldBorrowers.map(b => [b.username, b.amount]);

    await reverseMultiPayerDebt(req.group.id, oldLendersData, oldBorrowersData, expense.amount);

    // Delete old records
    await ExpenseLender.destroy({ where: { expense_id: expense.id } });
    await ExpenseBorrower.destroy({ where: { expense_id: expense.id } });

    // Update expense
    expense.title = title;
    expense.amount = amount;
    expense.lender = newLendersData[0][0];
    await expense.save();

    // Create new records
    for (const [username, amt] of newLendersData) {
      await ExpenseLender.create({ expense_id: expense.id, username, amount: amt });
    }
    for (const [username, amt] of newBorrowersData) {
      await ExpenseBorrower.create({ expense_id: expense.id, username, amount: amt });
    }

    // Process new debt
    await processMultiPayerDebt(req.group.id, newLendersData, newBorrowersData, amount);
    await simplifyDebts(req.group.id);

    // Log activity
    await ActivityLog.create({
      group_id: req.group.id,
      user: req.user.username,
      action: 'expense_edited',
      description: `Edited expense '${title}'`,
    });

    const result = await serializeExpense(expense);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Edit expense error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /groups/:group_id/expenses/:expense_id/comments
router.get('/:expense_id/comments', authenticate, requireGroupMember, async (req, res) => {
  try {
    const comments = await ExpenseComment.findAll({
      where: { expense_id: req.params.expense_id },
      order: [['created_at', 'ASC']],
    });
    return res.status(200).json(comments.map(c => ({
      id: c.id,
      expense: c.expense_id,
      author: c.author,
      text: c.text,
      created_at: c.created_at,
    })));
  } catch (err) {
    console.error('List comments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /groups/:group_id/expenses/:expense_id/comments
router.post('/:expense_id/comments', authenticate, requireGroupMember, async (req, res) => {
  try {
    const expense = await Expense.findOne({
      where: { id: req.params.expense_id, group_id: req.group.id },
    });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const { text } = req.body;

    // Create user comment
    await ExpenseComment.create({
      expense_id: expense.id,
      author: req.user.username,
      text,
    });

    // Check for @SplitBot trigger
    if (text.startsWith('@SplitBot')) {
      const query = text.replace(/^@SplitBot\s*/i, '');

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

      const botReply = await getBotResponse(query, {
        balances,
        settlements,
        recent_expenses: expensesList,
      });

      await ExpenseComment.create({
        expense_id: expense.id,
        author: 'SplitBot',
        text: botReply,
      });
    }

    // Log activity
    await ActivityLog.create({
      group_id: req.group.id,
      user: req.user.username,
      action: 'expense_edited',
      description: `Commented on '${expense.title}'`,
    });

    // Return all comments
    const comments = await ExpenseComment.findAll({
      where: { expense_id: expense.id },
      order: [['created_at', 'ASC']],
    });
    return res.status(201).json(comments.map(c => ({
      id: c.id,
      expense: c.expense_id,
      author: c.author,
      text: c.text,
      created_at: c.created_at,
    })));
  } catch (err) {
    console.error('Create comment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /groups/:group_id/expenses/:expense_id/comments/:comment_id
router.delete('/:expense_id/comments/:comment_id', authenticate, requireGroupMember, async (req, res) => {
  try {
    const comment = await ExpenseComment.findOne({
      where: { id: req.params.comment_id, expense_id: req.params.expense_id },
    });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    if (comment.author !== req.user.username) {
      return res.status(403).json({ error: 'You can only delete your own comments.' });
    }

    const expense = await Expense.findByPk(req.params.expense_id);

    // Log activity
    await ActivityLog.create({
      group_id: req.group.id,
      user: req.user.username,
      action: 'expense_edited',
      description: `Deleted comment: '${comment.text.substring(0, 20)}...' on '${expense ? expense.title : ''}'`,
    });

    await comment.destroy();

    // Return remaining comments
    const comments = await ExpenseComment.findAll({
      where: { expense_id: req.params.expense_id },
      order: [['created_at', 'ASC']],
    });
    return res.status(200).json(comments.map(c => ({
      id: c.id,
      expense: c.expense_id,
      author: c.author,
      text: c.text,
      created_at: c.created_at,
    })));
  } catch (err) {
    console.error('Delete comment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /groups/:group_id/expenses/settlement
router.post('/settlement', authenticate, requireGroupMember, async (req, res) => {
  try {
    const { title, lender, borrowers, amount } = req.body;

    const expense = await Expense.create({
      group_id: req.group.id,
      title,
      author: req.user.username,
      lender: lender.toLowerCase(),
      amount,
    });

    const borrowersData = parsePeople(borrowers);
    for (const [username, amt] of borrowersData) {
      await ExpenseBorrower.create({
        expense_id: expense.id,
        username,
        amount: amt,
      });
    }

    // Log activity
    await ActivityLog.create({
      group_id: req.group.id,
      user: req.user.username,
      action: 'settlement',
      description: title,
    });

    const result = await serializeExpense(expense);
    return res.status(201).json(result);
  } catch (err) {
    console.error('Settlement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
