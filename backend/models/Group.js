const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  created_by_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  invite_code: {
    type: DataTypes.STRING(12),
    unique: true,
  },
}, {
  tableName: 'groups',
  timestamps: false,
  hooks: {
    beforeCreate: (group) => {
      if (!group.invite_code) {
        group.invite_code = uuidv4().replace(/-/g, '').substring(0, 12);
      }
    },
  },
});

module.exports = Group;
