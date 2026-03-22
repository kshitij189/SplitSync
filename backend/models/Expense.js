const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Expense = sequelize.define('Expense', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  author: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  lender: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'expenses',
  timestamps: false,
  hooks: {
    beforeCreate: (expense) => {
      expense.author = expense.author.toLowerCase();
      expense.lender = expense.lender.toLowerCase();
    },
    beforeUpdate: (expense) => {
      if (expense.changed('author')) expense.author = expense.author.toLowerCase();
      if (expense.changed('lender')) expense.lender = expense.lender.toLowerCase();
    },
  },
});

module.exports = Expense;
