const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OptimisedDebt = sequelize.define('OptimisedDebt', {
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
  tableName: 'optimised_debts',
  timestamps: false,
});

module.exports = OptimisedDebt;
