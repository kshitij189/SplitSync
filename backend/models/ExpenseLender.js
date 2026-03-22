const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ExpenseLender = sequelize.define('ExpenseLender', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  expense_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  username: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'expense_lenders',
  timestamps: false,
});

module.exports = ExpenseLender;
