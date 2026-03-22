const { Group, GroupMember } = require('../models');

const requireGroupMember = async (req, res, next) => {
  const groupId = req.params.group_id;

  const group = await Group.findByPk(groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const membership = await GroupMember.findOne({
    where: { group_id: groupId, user_id: req.user.id },
  });

  if (!membership) {
    return res.status(404).json({ error: 'Group not found' });
  }

  req.group = group;
  next();
};

module.exports = { requireGroupMember };
