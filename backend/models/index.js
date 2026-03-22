const sequelize = require('../config/database');
const User = require('./User');
const Group = require('./Group');
const GroupMember = require('./GroupMember');
const UserDebt = require('./UserDebt');
const Debt = require('./Debt');
const OptimisedDebt = require('./OptimisedDebt');
const Expense = require('./Expense');
const ExpenseLender = require('./ExpenseLender');
const ExpenseBorrower = require('./ExpenseBorrower');
const ExpenseComment = require('./ExpenseComment');
const ActivityLog = require('./ActivityLog');

// Group belongs to User (created_by)
Group.belongsTo(User, { foreignKey: 'created_by_id', as: 'created_by' });

// Group <-> User many-to-many through GroupMember
Group.belongsToMany(User, { through: GroupMember, foreignKey: 'group_id', otherKey: 'user_id', as: 'members' });
User.belongsToMany(Group, { through: GroupMember, foreignKey: 'user_id', otherKey: 'group_id', as: 'expense_groups' });

// UserDebt belongs to Group
UserDebt.belongsTo(Group, { foreignKey: 'group_id' });
Group.hasMany(UserDebt, { foreignKey: 'group_id', as: 'user_debts' });

// Debt belongs to Group
Debt.belongsTo(Group, { foreignKey: 'group_id' });
Group.hasMany(Debt, { foreignKey: 'group_id', as: 'debts' });

// OptimisedDebt belongs to Group
OptimisedDebt.belongsTo(Group, { foreignKey: 'group_id' });
Group.hasMany(OptimisedDebt, { foreignKey: 'group_id', as: 'optimised_debts' });

// Expense belongs to Group
Expense.belongsTo(Group, { foreignKey: 'group_id' });
Group.hasMany(Expense, { foreignKey: 'group_id', as: 'expenses' });

// ExpenseLender belongs to Expense
ExpenseLender.belongsTo(Expense, { foreignKey: 'expense_id' });
Expense.hasMany(ExpenseLender, { foreignKey: 'expense_id', as: 'lenders' });

// ExpenseBorrower belongs to Expense
ExpenseBorrower.belongsTo(Expense, { foreignKey: 'expense_id' });
Expense.hasMany(ExpenseBorrower, { foreignKey: 'expense_id', as: 'borrowers' });

// ExpenseComment belongs to Expense
ExpenseComment.belongsTo(Expense, { foreignKey: 'expense_id' });
Expense.hasMany(ExpenseComment, { foreignKey: 'expense_id', as: 'comments' });

// ActivityLog belongs to Group
ActivityLog.belongsTo(Group, { foreignKey: 'group_id' });
Group.hasMany(ActivityLog, { foreignKey: 'group_id', as: 'activities' });

module.exports = {
  sequelize,
  User,
  Group,
  GroupMember,
  UserDebt,
  Debt,
  OptimisedDebt,
  Expense,
  ExpenseLender,
  ExpenseBorrower,
  ExpenseComment,
  ActivityLog,
};
