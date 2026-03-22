const express = require('express');
const jwt = require('jsonwebtoken');
const { User, Group, GroupMember, ActivityLog } = require('../models');
const { generateTokens, blacklistToken, isBlacklisted } = require('../utils/tokens');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const lowerUsername = username.toLowerCase();
    let user = await User.findOne({ where: { username: lowerUsername } });

    if (user) {
      if (user.has_usable_password) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      // Claim dummy account
      await user.setPassword(password);
      user.email = email || user.email;
      user.first_name = firstName || user.first_name;
      user.last_name = lastName || user.last_name;
      await user.save();
    } else {
      user = User.build({
        username: lowerUsername,
        email: email || '',
        first_name: firstName || '',
        last_name: lastName || '',
      });
      await user.setPassword(password);
      await user.save();
    }

    // Handle invite code for automated join notification
    const { inviteCode } = req.body;
    if (inviteCode) {
      const group = await Group.findOne({ where: { invite_code: inviteCode } });
      if (group) {
        // Check if already a member (manual add byproduct)
        const isMember = await GroupMember.findOne({ where: { group_id: group.id, user_id: user.id } });
        if (isMember) {
          // Log the "changed a member" message as requested
          await ActivityLog.create({
            group_id: group.id,
            user: user.username,
            action: 'member_added',
            description: `${user.username} changed a member : ${user.username}`,
          });
        }
      }
    }

    const tokens = generateTokens(user);
    return res.status(201).json({
      ...tokens,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const lowerUsername = username.toLowerCase();
    const user = await User.findOne({ where: { username: lowerUsername } });

    if (!user || !await user.checkPassword(password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Handle invite code for automated join notification (Login)
    const { inviteCode } = req.body;
    if (inviteCode) {
      const group = await Group.findOne({ where: { invite_code: inviteCode } });
      if (group) {
        const isMember = await GroupMember.findOne({ where: { group_id: group.id, user_id: user.id } });
        if (isMember) {
          await ActivityLog.create({
            group_id: group.id,
            user: user.username,
            action: 'member_added',
            description: `${user.username} changed a member : ${user.username}`,
          });
        }
      }
    }

    const tokens = generateTokens(user);
    return res.status(200).json({
      ...tokens,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/google
router.post('/google', async (req, res) => {
  try {
    const { credential, email, given_name, family_name, sub } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided' });
    }

    if (!credential) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    // Verify Google access token
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${credential}`
      );
      const tokenInfo = await response.json();

      if (!response.ok) {
        return res.status(401).json({ error: 'Invalid Google access token' });
      }

      if (tokenInfo.email && tokenInfo.email !== email) {
        return res.status(401).json({ error: 'Email mismatch' });
      }
    } catch (err) {
      return res.status(401).json({ error: 'Invalid Google access token' });
    }

    // Find or create user
    let user = await User.findOne({ where: { email } });

    if (!user) {
      // Generate username from email prefix
      let baseUsername = email.split('@')[0].toLowerCase();
      let username = baseUsername;
      let counter = 1;

      while (await User.findOne({ where: { username } })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      user = User.build({
        username,
        email,
        first_name: given_name || '',
        last_name: family_name || '',
      });
      user.setUnusablePassword();
      await user.save();
    }

    // Handle invite code for automated join notification (Google Login)
    const { inviteCode } = req.body;
    if (inviteCode) {
      const group = await Group.findOne({ where: { invite_code: inviteCode } });
      if (group) {
        const isMember = await GroupMember.findOne({ where: { group_id: group.id, user_id: user.id } });
        if (isMember) {
          await ActivityLog.create({
            group_id: group.id,
            user: user.username,
            action: 'member_added',
            description: `${user.username} changed a member : ${user.username}`,
          });
        }
      }
    }

    const tokens = generateTokens(user);
    return res.status(200).json({
      ...tokens,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/token/refresh
router.post('/token/refresh', async (req, res) => {
  try {
    const { refresh } = req.body;
    if (!refresh) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    if (isBlacklisted(refresh)) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    try {
      const decoded = jwt.verify(refresh, process.env.SECRET_KEY);
      if (decoded.type !== 'refresh') {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      const user = await User.findByPk(decoded.user_id);
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      // Blacklist old refresh token (rotate)
      blacklistToken(refresh);

      const tokens = generateTokens(user);
      return res.status(200).json(tokens);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  } catch (err) {
    console.error('Token refresh error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refresh } = req.body;
    if (refresh) {
      blacklistToken(refresh);
    }
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    return res.status(200).json({ message: 'Logged out successfully' });
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res) => {
  return res.status(200).json(req.user.toJSON());
});

module.exports = router;
