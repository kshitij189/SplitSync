const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserDebt = sequelize.define('UserDebt', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  username: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  net_debt: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'user_debts',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['group_id', 'username'],
    },
  ],
});

module.exports = UserDebt;
