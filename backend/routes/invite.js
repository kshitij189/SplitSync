const express = require('express');
const {
  Group, User, GroupMember, UserDebt, Debt, OptimisedDebt,
  Expense, ExpenseLender, ExpenseBorrower, ExpenseComment, ActivityLog,
} = require('../models');
const { authenticate } = require('../middleware/auth');
const { serializeGroup } = require('../utils/groupSerializer');

const router = express.Router();

// GET /invite/:invite_code - Get group info from invite code
router.get('/:invite_code', async (req, res) => {
  try {
    const group = await Group.findOne({
      where: { invite_code: req.params.invite_code },
    });

    if (!group) {
      return res.status(404).json({ error: 'Invalid invite link' });
    }

    const members = await group.getMembers();
    const memberList = members.map(m => ({
      id: m.id,
      username: m.username,
      is_dummy: !m.has_usable_password,
    }));

    return res.status(200).json({
      group_id: group.id,
      group_name: group.name,
      invite_code: group.invite_code,
      members: memberList,
    });
  } catch (err) {
    console.error('Get invite error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /invite/:invite_code/claim - Claim a dummy member's spot
router.post('/:invite_code/claim', authenticate, async (req, res) => {
  try {
    const { member_id } = req.body;
    if (!member_id) {
      return res.status(400).json({ error: 'member_id is required' });
    }

    const group = await Group.findOne({
      where: { invite_code: req.params.invite_code },
    });
    if (!group) {
      return res.status(404).json({ error: 'Invalid invite link' });
    }

    // Find the member
    const dummyUser = await User.findByPk(member_id);
    if (!dummyUser) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check member is in the group
    const isMember = await GroupMember.findOne({
      where: { group_id: group.id, user_id: dummyUser.id },
    });
    if (!isMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check member is dummy
    if (dummyUser.has_usable_password) {
      return res.status(400).json({ error: 'This member already has an account and cannot be claimed.' });
    }

    // Check current user is not already in the group
    const alreadyMember = await GroupMember.findOne({
      where: { group_id: group.id, user_id: req.user.id },
    });
    if (alreadyMember) {
      return res.status(400).json({ error: 'You are already a member of this group' });
    }

    const oldUsername = dummyUser.username;
    const newUsername = req.user.username;

    // Remove dummy, add current user
    await GroupMember.destroy({
      where: { group_id: group.id, user_id: dummyUser.id },
    });
    await GroupMember.create({
      group_id: group.id,
      user_id: req.user.id,
    });

    // Update all username references in this group
    await UserDebt.update(
      { username: newUsername },
      { where: { group_id: group.id, username: oldUsername } }
    );

    await Debt.update(
      { from_user: newUsername },
      { where: { group_id: group.id, from_user: oldUsername } }
    );
    await Debt.update(
      { to_user: newUsername },
      { where: { group_id: group.id, to_user: oldUsername } }
    );

    await OptimisedDebt.update(
      { from_user: newUsername },
      { where: { group_id: group.id, from_user: oldUsername } }
    );
    await OptimisedDebt.update(
      { to_user: newUsername },
      { where: { group_id: group.id, to_user: oldUsername } }
    );

    // Get all expense IDs in this group for scoped updates
    const groupExpenses = await Expense.findAll({
      where: { group_id: group.id },
      attributes: ['id'],
    });
    const expenseIds = groupExpenses.map(e => e.id);

    await Expense.update(
      { author: newUsername },
      { where: { group_id: group.id, author: oldUsername } }
    );
    await Expense.update(
      { lender: newUsername },
      { where: { group_id: group.id, lender: oldUsername } }
    );

    if (expenseIds.length > 0) {
      await ExpenseLender.update(
        { username: newUsername },
        { where: { expense_id: expenseIds, username: oldUsername } }
      );
      await ExpenseBorrower.update(
        { username: newUsername },
        { where: { expense_id: expenseIds, username: oldUsername } }
      );
      await ExpenseComment.update(
        { author: newUsername },
        { where: { expense_id: expenseIds, author: oldUsername } }
      );
    }

    await ActivityLog.update(
      { user: newUsername },
      { where: { group_id: group.id, user: oldUsername } }
    );

    // Delete dummy user if not in any other groups
    const otherGroups = await GroupMember.findOne({
      where: { user_id: dummyUser.id },
    });
    if (!otherGroups) {
      await dummyUser.destroy();
    }

    // Log activity
    await ActivityLog.create({
      group_id: group.id,
      user: newUsername,
      action: 'member_added',
      description: `${newUsername} changed a member : ${oldUsername}`,
    });

    const result = await serializeGroup(group);
    return res.status(200).json({
      message: `Successfully joined as ${newUsername}`,
      group: result,
    });
  } catch (err) {
    console.error('Claim invite error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
