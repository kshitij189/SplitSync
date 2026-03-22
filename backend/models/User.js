const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING(150),
    unique: true,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(254),
    defaultValue: '',
  },
  first_name: {
    type: DataTypes.STRING(150),
    defaultValue: '',
  },
  last_name: {
    type: DataTypes.STRING(150),
    defaultValue: '',
  },
  password: {
    type: DataTypes.STRING(128),
    allowNull: true,
  },
  has_usable_password: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'users',
  timestamps: false,
});

User.prototype.checkPassword = async function (password) {
  if (!this.has_usable_password) return false;
  return bcrypt.compare(password, this.password);
};

User.prototype.setPassword = async function (password) {
  this.password = await bcrypt.hash(password, 10);
  this.has_usable_password = true;
};

User.prototype.setUnusablePassword = function () {
  this.password = '!unusable';
  this.has_usable_password = false;
};

User.prototype.toJSON = function () {
  return {
    id: this.id,
    username: this.username,
    first_name: this.first_name,
    last_name: this.last_name,
    email: this.email,
  };
};

module.exports = User;
