const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
// IMPORTANT: For Render, we need to get the secret from environment variables
// We will set this up in Render's settings later if needed.
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key-change-this';

// Allow the extension to talk to our API
app.use(cors());
app.use(express.json());

// Simple in-memory storage (in a real app, you'd use a database)
const users = [];
const tiktokAccounts = {}; // Tracks which aadvids have been used

// --- ENDPOINT 1: Register a new user ---
app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;

  // Basic validation
  if (!email || !password || !name) {
    return res.status(400).json({ status: 400, message: 'Missing email, password, or name' });
  }

  // Check if user already exists
  if (users.find(user => user.email === email)) {
    return res.status(400).json({
      status: 400,
      message: 'User already exists'
    });
  }

  // Create new user (In real app, hash password here)
  const userId = Date.now().toString(); // Simple unique ID
  const newUser = {
    _id: userId,
    email,
    password, // WARNING: Storing plain text password - only for simple demo
    name,
    linkedTiktokAccounts: 0,
    linked_tiktok_accounts_limit: 10 // Default limit
  };

  users.push(newUser);
  console.log('User registered:', newUser.email);

  // Generate token
  const accessToken = jwt.sign(
    { userId: newUser._id },
    JWT_SECRET,
    { expiresIn: '24h' } // Token lasts for 24 hours
  );

  // Send success response
  res.status(201).json({
    status: 200, // Mirroring original API's success status
    data: {
      user: {
        _id: newUser._id,
        name: newUser.name,
        linkedTiktokAccounts: newUser.linkedTiktokAccounts,
        linked_tiktok_accounts_limit: newUser.linked_tiktok_accounts_limit
      },
      tokens: {
        accessToken
      }
    }
  });
});

// --- ENDPOINT 2: Login user ---
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ status: 400, message: 'Missing email or password' });
  }

  // Find user (WARNING: Comparing plain text password)
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({
      status: 401,
      message: 'Invalid credentials'
    });
  }

  console.log('User logged in:', user.email);

  // Generate token
  const accessToken = jwt.sign(
    { userId: user._id },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  // Send success response
  res.json({
    status: 200,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        linkedTiktokAccounts: user.linkedTiktokAccounts,
        linked_tiktok_accounts_limit: user.linked_tiktok_accounts_limit
      },
      tokens: {
        accessToken
      }
    }
  });
});

// --- Middleware to check if user is logged in (verify token) ---
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization; // Get token from 'Authorization' header

  if (!token) {
    return res.status(401).json({
      status: 401,
      message: 'No token provided'
    });
  }

  try {
    // Check if token is valid
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId; // Add userId to the request object
    next(); // Proceed to the next function (the endpoint handler)
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({
      status: 401,
      message: 'Invalid token'
    });
  }
};

// --- ENDPOINT 3: Create checkout session ---
// This endpoint now requires a valid token (checked by verifyToken middleware)
app.post('/api/checkout/create', verifyToken, (req, res) => {
  const { aadvid, depositAmount } = req.body; // userId comes from verifyToken
  const userId = req.userId;

  // Validate input
  if (!aadvid || !depositAmount) {
    return res.status(400).json({
      status: 400,
      message: 'Missing required fields (aadvid or depositAmount)'
    });
  }

  // Find user from the verified token
  const user = users.find(u => u._id === userId);
  if (!user) {
    // This shouldn't happen if token is valid, but good to check
    return res.status(404).json({
      status: 404,
      message: 'User not found for this token'
    });
  }

  // Check account limits
  // Note: This simple check only counts unique aadvids used *since the server started*
  if (!tiktokAccounts[aadvid]) { // If this is the first time seeing this aadvid
      if (user.linkedTiktokAccounts >= user.linked_tiktok_accounts_limit) {
          return res.status(400).json({
              status: 400,
              message: 'Account limit reached'
          });
      }
      // Only increment if it's a new account within limits
      tiktokAccounts[aadvid] = true; // Mark this aadvid as seen
      user.linkedTiktokAccounts += 1;
      console.log(`User ${user.email} linked new account ${aadvid}. Count: ${user.linkedTiktokAccounts}`);
  }

  console.log(`Checkout created for user ${user.email}, aadvid ${aadvid}, amount ${depositAmount}`);

  // Return success - the extension handles the actual payment redirect
  res.json({
    status: 200,
    message: 'Checkout created successfully',
    data: {
      checkout_id: Date.now().toString(), // Simple checkout ID
      aadvid,
      amount: depositAmount
    }
  });
});

// --- Health check endpoint --- (Good for testing if the API is running)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is running' });
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`JWT Secret Hint: Starts with '${JWT_SECRET.substring(0, 4)}'`); // Don't log the whole secret!
});

