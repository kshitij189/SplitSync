const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Debt = sequelize.define('Debt', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  from_user: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  to_user: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'debts',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['group_id', 'from_user', 'to_user'],
    },
  ],
});

module.exports = Debt;
