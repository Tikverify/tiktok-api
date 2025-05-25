// index.js (PIN Code Version)

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// --- PIN Code Configuration ---
// Read valid PINs from environment variable (comma-separated)
// Example: Set VALID_PINS="pin123,couponABC,secretXYZ" in Render
const validPinsEnv = process.env.VALID_PINS || ""; // Default to empty string if not set
const validPins = validPinsEnv.split(",").map(pin => pin.trim()).filter(pin => pin); // Split, trim whitespace, remove empty entries
if (validPins.length === 0) {
    console.warn("WARNING: No VALID_PINS environment variable set or it's empty. No PINs will be accepted.");
}
// -----------------------------

// Allow the extension to talk to our API
app.use(cors());
app.use(express.json());

// --- Simple in-memory storage (Not used for auth anymore, but kept from original) ---
const users = []; // Kept from original, but not used for PIN auth
const tiktokAccounts = {}; // Kept from original
// ----------------------------------------------------------------------------------

// --- ENDPOINT: Verify PIN and Account Limit (Used by Extension) ---
app.post("/api/verify", (req, res) => {
    // Extension will now send 'pin' instead of 'key'
    const { pin, ads_id, csrftoken, mstoken, cookies } = req.body;

    console.log("Received verification request with PIN:", pin, "and ads_id:", ads_id);

    // --- PIN Code Validation Logic ---
    if (!pin || !validPins.includes(pin)) {
        console.log("Verification failed: Invalid or missing PIN code");
        return res.status(401).json({ status: false, error: "Invalid PIN code" });
    }
    // -------------------------------

    console.log(`Verification successful for PIN ${pin}`);

    // --- Optional: Account Limit Check (If needed, but no user context here) ---
    // Since we don't have a specific user tied to the PIN in this simple model,
    // a global limit check might not be meaningful. You could add logic here
    // if you want to track usage per PIN or globally.
    // For now, we'll just approve if the PIN is valid.
    // -------------------------------------------------------------------------

    // Send success response back to the extension
    // We don't have user details, so just send status
    res.json({ status: true, valid: true });
});

// --- ENDPOINT: Process Balance (Used by Extension) ---
app.post("/api/process-balance", (req, res) => {
    // Extension will now send 'pin' instead of 'key'
    const { pin, ads_id, csrftoken, mstoken, amount, cookies } = req.body;

    console.log("Received balance request with PIN:", pin, "ads_id:", ads_id, "amount:", amount);

    // --- PIN Code Validation Logic (Repeat for security) ---
    if (!pin || !validPins.includes(pin)) {
        console.log("Balance processing failed: Invalid or missing PIN code");
        return res.status(401).json({ status: false, message: "Invalid PIN code" });
    }
    // ----------------------------------------------------

    console.log(`Balance processing authorized for PIN ${pin}`);

    // --- Your balance processing logic here --- 
    // IMPORTANT: Replace with your actual redirect logic/payment gateway integration
    // You might want to include the ads_id and amount in the redirect URL.
    const redirectUrl = `https://yourpaymentgateway.com/pay?ads_account=${ads_id}&amount=${amount}`;
    
    res.json({
        status: 200, 
        message: "OK", 
        data: {
            redirect_url: redirectUrl
        }
    } );
});

// --- Health check endpoint --- (Good for testing if the API is running)
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", message: "API is running" });
});

// --- Removed Endpoints (Not needed for simple PIN system) ---
// /api/auth/register
// /api/auth/login
// /api/checkout/create (Functionality merged into /api/process-balance)
// ------------------------------------------------------------

// --- Start the server ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("PIN Mode Active.");
    console.log("Reading VALID_PINS from environment variable.");
    console.log("Currently accepted PINs (from env var):", validPins);
    console.log("Ensure VALID_PINS is set correctly in your Render environment settings (e.g., 'pin1,pin2,pin3').");
});

