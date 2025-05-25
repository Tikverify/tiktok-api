const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid"); // Import uuid for key generation

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "your-default-secret-key-change-this";

app.use(cors());
app.use(express.json());

// --- In-memory storage (DEMO ONLY - USE A DATABASE IN PRODUCTION) ---
const users = [];
const tiktokAccounts = {};
// Add storage for API Keys
const apiKeys = [
    // Example structure: { key: "key-uuid-string", userId: "user-id", active: true, createdAt: Date }
    // Add some initial keys for testing if needed, linking them to potential user IDs
];
// ------------------------------------------------------------------

// --- Middleware to check if user is logged in (verify JWT token) ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Expecting "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({
            status: 401,
            message: "No token provided",
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId; // Add userId to the request object
        // Check if user exists in our simple store
        const user = users.find(u => u._id === req.userId);
        if (!user) {
            throw new Error("User not found for token");
        }
        req.user = user; // Attach user object to request
        next();
    } catch (error) {
        console.error("Token verification failed:", error.message);
        return res.status(401).json({
            status: 401,
            message: "Invalid or expired token",
        });
    }
};

// --- ENDPOINT: Register a new user (Modified slightly for clarity) ---
app.post("/api/auth/register", (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ status: 400, message: "Missing email, password, or name" });
    }
    if (users.find((user) => user.email === email)) {
        return res.status(400).json({ status: 400, message: "User already exists" });
    }
    const userId = Date.now().toString();
    const newUser = {
        _id: userId,
        email,
        password, // WARNING: Plain text password
        name,
        linkedTiktokAccounts: 0,
        linked_tiktok_accounts_limit: 10,
    };
    users.push(newUser);
    console.log("User registered:", newUser.email);
    const accessToken = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: "24h" });
    res.status(201).json({
        status: 200,
        data: {
            user: { _id: newUser._id, name: newUser.name, linkedTiktokAccounts: newUser.linkedTiktokAccounts, linked_tiktok_accounts_limit: newUser.linked_tiktok_accounts_limit },
            tokens: { accessToken },
        },
    });
});

// --- ENDPOINT: Login user (Modified slightly for clarity) ---
app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ status: 400, message: "Missing email or password" });
    }
    const user = users.find((u) => u.email === email && u.password === password); // WARNING: Plain text password check
    if (!user) {
        return res.status(401).json({ status: 401, message: "Invalid credentials" });
    }
    console.log("User logged in:", user.email);
    const accessToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "24h" });
    res.json({
        status: 200,
        data: {
            user: { _id: user._id, name: user.name, linkedTiktokAccounts: user.linkedTiktokAccounts, linked_tiktok_accounts_limit: user.linked_tiktok_accounts_limit },
            tokens: { accessToken },
        },
    });
});

// --- NEW ENDPOINT: Generate an API Key for the logged-in user ---
// Requires JWT authentication (user must be logged in)
app.post("/api/keys/generate", verifyToken, (req, res) => {
    const userId = req.userId; // Get user ID from verified token
    const user = req.user; // Get user object from middleware

    // Generate a new unique API key
    const newKeyString = `tik-${uuidv4()}`;
    const newApiKey = {
        key: newKeyString,
        userId: userId,
        active: true,
        createdAt: new Date(),
    };

    // Store the new key (DEMO: in-memory array)
    apiKeys.push(newApiKey);
    console.log(`Generated new API key for user ${user.email}: ${newKeyString}`);
    console.log("Current keys:", apiKeys);

    // Return the newly generated key to the user
    res.status(201).json({
        status: 201,
        message: "API Key generated successfully",
        data: {
            apiKey: newKeyString,
        },
    });
});

// --- NEW ENDPOINT: List API Keys for the logged-in user ---
// Requires JWT authentication
app.get("/api/keys", verifyToken, (req, res) => {
    const userId = req.userId;
    const userKeys = apiKeys.filter(k => k.userId === userId);
    console.log(`Fetching keys for user ${req.user.email}`);
    res.json({
        status: 200,
        data: {
            apiKeys: userKeys.map(k => ({ key: k.key, active: k.active, createdAt: k.createdAt })) // Don't expose userId again
        }
    });
});

// --- MODIFIED ENDPOINT: Verify API Key (Used by Extension) ---
// This endpoint does NOT require JWT auth, it validates the key itself
app.post("/api/verify", (req, res) => {
    const { key, ads_id, csrftoken, mstoken, cookies } = req.body;
    console.log("Received verification request for key:", key, "and ads_id:", ads_id);

    // --- API Key Validation Logic ---
    const apiKeyData = apiKeys.find(k => k.key === key && k.active === true);
    if (!apiKeyData) {
        console.log("Verification failed: Invalid or inactive API key");
        return res.status(401).json({ status: false, error: "Invalid API key" });
    }
    // -------------------------------

    // Key is valid, find the associated user
    const user = users.find(u => u._id === apiKeyData.userId);
    if (!user) {
        // Should not happen if data is consistent, but good practice
        console.error(`Consistency error: API key ${key} found but user ${apiKeyData.userId} not found.`);
        return res.status(500).json({ status: false, error: "Internal server error" });
    }

    console.log(`Verification successful for key ${key} belonging to user ${user.email}`);

    // Check account limits (using the logic from your original checkout endpoint)
    if (!tiktokAccounts[ads_id]) { // If this is the first time seeing this aadvid for this session
        if (user.linkedTiktokAccounts >= user.linked_tiktok_accounts_limit) {
            console.log(`Account limit reached for user ${user.email} trying to use ${ads_id}`);
            return res.status(400).json({
                status: false, // Indicate failure
                error: `Account limit reached (${user.linked_tiktok_accounts_limit})`
            });
        }
        // Only increment if it's a new account within limits
        tiktokAccounts[ads_id] = true; // Mark this aadvid as seen for this server run
        user.linkedTiktokAccounts += 1;
        console.log(`User ${user.email} linked new account ${ads_id} via API key. Count: ${user.linkedTiktokAccounts}`);
    }

    // Send success response back to the extension
    res.json({ status: true, valid: true, user_id: user._id, user_name: user.name }); // Send some user info
});

// --- MODIFIED ENDPOINT: Process Balance (Used by Extension) ---
// This endpoint also does NOT require JWT auth, it validates the key itself
app.post("/api/process-balance", (req, res) => {
    const { key, ads_id, csrftoken, mstoken, amount, cookies } = req.body;
    console.log("Received balance request for key:", key, "ads_id:", ads_id, "amount:", amount);

    // --- API Key Validation Logic (Repeat for security) ---
    const apiKeyData = apiKeys.find(k => k.key === key && k.active === true);
    if (!apiKeyData) {
        console.log("Balance processing failed: Invalid or inactive API key");
        return res.status(401).json({ status: false, message: "Invalid API key" });
    }
    // ----------------------------------------------------

    // Key is valid, find the associated user
    const user = users.find(u => u._id === apiKeyData.userId);
    if (!user) {
        console.error(`Consistency error: API key ${key} found but user ${apiKeyData.userId} not found.`);
        return res.status(500).json({ status: false, message: "Internal server error" });
    }

    console.log(`Balance processing authorized for key ${key} (User: ${user.email})`);

    // --- Your balance processing logic here --- 
    // This part likely involves interacting with another service or database
    // based on the amount, ads_id, and the validated user.
    // For now, let's simulate a success that gives a redirect URL.

    // IMPORTANT: Replace with your actual redirect logic/payment gateway integration
    const redirectUrl = `https://yourpaymentgateway.com/pay?user_id=${user._id}&ads_account=${ads_id}&amount=${amount}`;
    
    res.json({
        status: 200, 
        message: "OK", 
        data: {
            redirect_url: redirectUrl
        }
    });
});

// --- Endpoint: Create checkout session (Original - Kept for reference, uses JWT) ---
// Note: This might be redundant now if balance is handled via /api/process-balance
app.post("/api/checkout/create", verifyToken, (req, res) => {
    const { aadvid, depositAmount } = req.body;
    const userId = req.userId;
    const user = req.user;
    if (!aadvid || !depositAmount) {
        return res.status(400).json({ status: 400, message: "Missing required fields (aadvid or depositAmount)" });
    }
    if (!tiktokAccounts[aadvid]) {
        if (user.linkedTiktokAccounts >= user.linked_tiktok_accounts_limit) {
            return res.status(400).json({ status: 400, message: "Account limit reached" });
        }
        tiktokAccounts[aadvid] = true;
        user.linkedTiktokAccounts += 1;
        console.log(`User ${user.email} linked new account ${aadvid} via JWT checkout. Count: ${user.linkedTiktokAccounts}`);
    }
    console.log(`JWT Checkout created for user ${user.email}, aadvid ${aadvid}, amount ${depositAmount}`);
    res.json({
        status: 200,
        message: "Checkout created successfully",
        data: { checkout_id: Date.now().toString(), aadvid, amount: depositAmount },
    });
});

// --- Health check endpoint ---
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", message: "API is running" });
});

// --- Start the server ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`JWT Secret Hint: Starts with '${JWT_SECRET.substring(0, 4)}'`);
    console.log("DEMO: API Keys will be stored in memory:", apiKeys);
    console.log("DEMO: Use POST /api/keys/generate (with JWT Bearer token) to create keys.");
    console.log("DEMO: Use GET /api/keys (with JWT Bearer token) to list keys for the logged-in user.");
    console.log("IMPORTANT: Replace in-memory storage with a database for production!");
});

