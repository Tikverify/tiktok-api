const express = require(\'express\');
const jwt = require(\'jsonwebtoken\');
const cors = require(\'cors\');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || \'your-secret-key-change-this\';

// Allow the extension to talk to our API
app.use(cors());
app.use(express.json());

// Simple in-memory storage (in a real app, you\'d use a database)
const users = [];
const tiktokAccounts = {};

// ENDPOINT 1: Register a new user
app.post(\'/api/auth/register\', (req, res) => {
  const { email, password, name } = req.body;
  
  // Check if user already exists
  if (users.find(user => user.email === email)) {
    return res.status(400).json({
      status: 400,
      message: \'User already exists\'
    });
  }
  
  // Create new user
  const userId = Date.now().toString();
  const user = {
    _id: userId,
    email,
    password, // In a real app, you\'d hash this password
    name,
    linkedTiktokAccounts: 0,
    linked_tiktok_accounts_limit: 10
  };
  
  users.push(user);
  
  // Generate token
  const accessToken = jwt.sign(
    { userId: user._id },
    JWT_SECRET,
    { expiresIn: \'24h\' }
  );
  
  res.status(201).json({
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

// ENDPOINT 2: Login user
app.post(\'/api/auth/login\', (req, res) => {
  const { email, password } = req.body;
  
  // Find user
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({
      status: 401,
      message: \'Invalid credentials\'
    });
  }
  
  // Generate token
  const accessToken = jwt.sign(
    { userId: user._id },
    JWT_SECRET,
    { expiresIn: \'24h\' }
  );
  
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

// Simple middleware to check if user is logged in
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  
  if (!token) {
    return res.status(401).json({
      status: 401,
      message: \'No token provided\'
    });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 401,
      message: \'Invalid token\'
    });
  }
};

// ENDPOINT 3: Create checkout session
app.post(\'/api/checkout/create\', verifyToken, (req, res) => {
  const { aadvid, depositAmount, userId } = req.body;
  
  // Validate input
  if (!aadvid || !depositAmount) {
    return res.status(400).json({
      status: 400,
      message: \'Missing required fields\'
    });
  }
  
  // Find user
  const user = users.find(u => u._id === req.userId);
  if (!user) {
    return res.status(404).json({
      status: 404,
      message: \'User not found\'
    });
  }
  
  // Check account limits
  if (user.linkedTiktokAccounts >= user.linked_tiktok_accounts_limit) {
    return res.status(400).json({
      status: 400,
      message: \'Account limit reached\'
    });
  }
  
  // Track this TikTok account if it\'s new
  if (!tiktokAccounts[aadvid]) {
    tiktokAccounts[aadvid] = true;
    user.linkedTiktokAccounts += 1;
  }
  
  // Return success - the extension will handle the actual payment process
  res.json({
    status: 200,
    message: \'Checkout created successfully\',
    data: {
      checkout_id: Date.now().toString(),
      aadvid,
      amount: depositAmount
    }
  });
});

// Health check endpoint
app.get(\'/health\', (req, res) => {
  res.status(200).json({ status: \'ok\' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
