const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;

if (process.env.DATABASE_URL) {
  // Use connection string (standard for Render, Neon, Railway, etc.)
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: process.env.DEBUG === 'true' ? console.log : false,
    dialectOptions: {
      ssl: process.env.DB_SSL === 'false'
        ? false
        : { require: true, rejectUnauthorized: false },
    },
  });
} else {
  // Fall back to individual env vars
  sequelize = new Sequelize(
    process.env.DATABASE_NAME || 'splitease',
    process.env.DATABASE_USER || 'postgres',
    process.env.DATABASE_PASSWORD || '',
    {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT) || 5432,
      dialect: 'postgres',
      logging: process.env.DEBUG === 'true' ? console.log : false,
      dialectOptions: {
        ssl: process.env.DB_SSL === 'false'
          ? false
          : { require: true, rejectUnauthorized: false },
      },
    }
  );
}

module.exports = sequelize;
