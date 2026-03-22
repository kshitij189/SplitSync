const express = require('express');
const { Group, User, GroupMember, UserDebt, ActivityLog } = require('../models');
const { authenticate } = require('../middleware/auth');
const { requireGroupMember } = require('../middleware/groupMember');
const { serializeGroup } = require('../utils/groupSerializer');

const router = express.Router();

// GET /groups - List user's groups
router.get('/', authenticate, async (req, res) => {
  try {
    const groups = await Group.findAll({
      include: [{
        model: User,
        as: 'members',
        where: { id: req.user.id },
        attributes: [],
      }],
      order: [['created_at', 'DESC']],
    });

    const result = await Promise.all(groups.map(g => serializeGroup(g)));
    return res.status(200).json(result);
  } catch (err) {
    console.error('List groups error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /groups - Create group
router.post('/', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const group = await Group.create({
      name,
      created_by_id: req.user.id,
    });

    // Add creator as member
    await group.addMember(req.user);

    // Create UserDebt for creator
    await UserDebt.create({
      group_id: group.id,
      username: req.user.username,
      net_debt: 0,
    });

    // Log activity
    await ActivityLog.create({
      group_id: group.id,
      user: req.user.username,
      action: 'group_created',
      description: `Created group '${name}'`,
    });

    const result = await serializeGroup(group);
    return res.status(201).json(result);
  } catch (err) {
    console.error('Create group error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /groups/:group_id - Get group details
router.get('/:group_id', authenticate, requireGroupMember, async (req, res) => {
  try {
    const result = await serializeGroup(req.group);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Get group error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /groups/:group_id - Delete group
router.delete('/:group_id', authenticate, requireGroupMember, async (req, res) => {
  try {
    if (req.group.created_by_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the creator can delete the group' });
    }

    await req.group.destroy();
    return res.status(204).send();
  } catch (err) {
    console.error('Delete group error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /groups/:group_id/members - Add member
router.post('/:group_id/members', authenticate, requireGroupMember, async (req, res) => {
  try {
    let { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    username = username.trim();

    // Find or create user
    let [user, created] = await User.findOrCreate({
      where: { username },
      defaults: {
        username,
        first_name: username,
        last_name: '',
        email: '',
        password: '!unusable',
        has_usable_password: false,
      },
    });

    // Check if already a member
    const existing = await GroupMember.findOne({
      where: { group_id: req.group.id, user_id: user.id },
    });

    if (existing) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    await req.group.addMember(user);

    // Create UserDebt
    await UserDebt.findOrCreate({
      where: { group_id: req.group.id, username: user.username },
      defaults: { net_debt: 0 },
    });

    // Log activity
    await ActivityLog.create({
      group_id: req.group.id,
      user: req.user.username,
      action: 'member_added',
      description: `Added ${username} to the group`,
    });

    const result = await serializeGroup(req.group);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Add member error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /groups/:group_id/users - List group members
router.get('/:group_id/users', authenticate, requireGroupMember, async (req, res) => {
  try {
    const members = await req.group.getMembers();
    return res.status(200).json(members.map(m => m.toJSON()));
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /groups/:group_id/activity - Activity log
router.get('/:group_id/activity', authenticate, requireGroupMember, async (req, res) => {
  try {
    const activities = await ActivityLog.findAll({
      where: { group_id: req.group.id },
      order: [['created_at', 'DESC']],
    });
    return res.status(200).json(activities);
  } catch (err) {
    console.error('Activity log error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
