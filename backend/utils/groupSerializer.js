const { Group, User } = require('../models');

async function serializeGroup(group) {
  const creator = await User.findByPk(group.created_by_id);
  const members = await group.getMembers();

  return {
    id: group.id,
    name: group.name,
    created_by: creator ? creator.toJSON() : null,
    members: members.map(m => m.toJSON()),
    created_at: group.created_at,
    invite_code: group.invite_code,
  };
}

module.exports = { serializeGroup };
