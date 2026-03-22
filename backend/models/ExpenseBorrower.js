const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ExpenseBorrower = sequelize.define('ExpenseBorrower', {
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
  tableName: 'expense_borrowers',
  timestamps: false,
});

module.exports = ExpenseBorrower;
