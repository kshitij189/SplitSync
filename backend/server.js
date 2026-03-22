require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');

const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const inviteRoutes = require('./routes/invite');
const expenseRoutes = require('./routes/expenses');
const debtRoutes = require('./routes/debts');
const aiChatRoutes = require('./routes/aiChat');

const app = express();

// CORS (must be first)
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json());

// Routes - mounted at root (no /api/ prefix per docs)
app.use('/auth', authRoutes);
app.use('/groups', groupRoutes);
app.use('/invite', inviteRoutes);

// Group-scoped routes
app.use('/groups/:group_id/expenses', expenseRoutes);
app.use('/groups/:group_id/debts', debtRoutes);
app.use('/groups/:group_id/optimisedDebts', require('./routes/optimisedDebts'));
app.use('/groups/:group_id/ai-chat', aiChatRoutes);

const PORT = process.env.PORT || 8000;

// Sync database and start server
sequelize.sync().then(() => {
  console.log('Database synced successfully.');
  app.listen(PORT, () => {
    console.log(`SplitSync backend running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to sync database:', err);
});
