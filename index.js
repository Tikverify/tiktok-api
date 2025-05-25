// index.js (PIN Code + TikTok Proxy Version)

const express = require("express");
const cors = require("cors");
const axios = require("axios"); // Import axios for making HTTP requests

const app = express();
const PORT = process.env.PORT || 3000;

// --- PIN Code Configuration ---
const validPinsEnv = process.env.VALID_PINS || "";
const validPins = validPinsEnv.split(",").map(pin => pin.trim()).filter(pin => pin);
if (validPins.length === 0) {
    console.warn("WARNING: No VALID_PINS environment variable set or it's empty. No PINs will be accepted.");
}
// -----------------------------

app.use(cors());
app.use(express.json());

// --- ENDPOINT: Verify PIN and Account Limit (Used by Extension) ---
app.post("/api/verify", (req, res) => {
    const { pin, ads_id, csrftoken, mstoken, cookies } = req.body;
    console.log("Received verification request with PIN:", pin, "and ads_id:", ads_id);

    // --- PIN Code Validation Logic ---
    if (!pin || !validPins.includes(pin)) {
        console.log("Verification failed: Invalid or missing PIN code");
        return res.status(401).json({ status: false, error: "Invalid PIN code" });
    }
    // -------------------------------

    console.log(`Verification successful for PIN ${pin}`);
    // Send success response back to the extension
    res.json({ status: true, valid: true });
});

// --- ENDPOINT: Process Balance (Acts as Proxy to TikTok API) ---
app.post("/api/process-balance", async (req, res) => { // Make the function async
    // Extension will send 'pin', 'ads_id', 'amount', 'csrftoken', 'mstoken'
    const { pin, ads_id, csrftoken, mstoken, amount, cookies } = req.body;

    console.log("Received balance request with PIN:", pin, "ads_id:", ads_id, "amount:", amount);

    // --- PIN Code Validation Logic ---
    if (!pin || !validPins.includes(pin)) {
        console.log("Balance processing failed: Invalid or missing PIN code");
        return res.status(401).json({ status: false, message: "Invalid PIN code" });
    }
    // --------------------------------

    // --- Input Validation ---
    if (!ads_id || !csrftoken || !mstoken || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        console.log("Balance processing failed: Missing or invalid parameters (ads_id, csrftoken, mstoken, amount)");
        return res.status(400).json({ status: false, message: "Missing or invalid parameters" });
    }
    // -----------------------

    console.log(`Balance processing authorized for PIN ${pin}. Attempting to proxy TikTok API...`);

    // --- TikTok API Proxy Logic ---
    const paymentUrl = `https://ads.tiktok.com/api/v3/i18n/payment/redirect/?aadvid=${ads_id}&req_src=bidding&msToken=${mstoken}`;

    const headers = {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9", // Simplified language header
        "cache-control": "no-cache",
        "content-type": "application/json",
        cookie: `csrftoken=${csrftoken}`, // Pass the csrftoken in the cookie header
        origin: "https://ads.tiktok.com",
        pragma: "no-cache",
        priority: "u=1, i",
        referer: `https://ads.tiktok.com/i18n/account/payment?aadvid=${ads_id}`,
        "sec-ch-ua": "\"Not A(Brand\";v=\"8\", \"Chromium\";v=\"132\", \"Google Chrome\";v=\"132\"", // Example UA
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"", // Example platform
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "trace-log-adv-id": `${ads_id}`,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36", // Example UA
        "x-csrftoken": csrftoken // Pass the csrftoken in the x-csrftoken header
    };

    const payload = {
        amount: parseFloat(amount).toFixed(2), // Ensure amount is a string with 2 decimal places
        risk_info: { // Simplified risk_info, might need adjustment if TikTok requires more
            cookie_enabled: true, // Assume cookies are enabled
            screen_width: 1920, // Example values
            screen_height: 1080,
            browser_language: "en-US",
            browser_platform: "Win32",
            browser_name: "Mozilla",
            browser_version: "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
            browser_online: true,
            timezone_name: "UTC", // Example timezone
            device_platform: "web"
        },
        upay_route: 1,
        use_sdk: 1,
        ad_channel: "TTAM_PAYMENT_PAGE"
    };

    try {
        console.log("Making POST request to TikTok API:", paymentUrl);
        console.log("Headers:", headers);
        console.log("Payload:", payload);

        const tiktokResponse = await axios.post(paymentUrl, payload, { headers });

        console.log("TikTok API Response Status:", tiktokResponse.status);
        console.log("TikTok API Response Data:", tiktokResponse.data);

        if (tiktokResponse.data && tiktokResponse.data.code === 0 && tiktokResponse.data.data && tiktokResponse.data.data.form_html) {
            // Success! Extract the form_html URL
            const redirectUrl = tiktokResponse.data.data.form_html;
            console.log("Successfully obtained redirect URL from TikTok:", redirectUrl);
            res.json({
                status: 200,
                message: "OK",
                data: {
                    redirect_url: redirectUrl
                }
            });
        } else {
            // TikTok API returned an error or unexpected format
            console.error("TikTok API did not return a successful code or form_html URL. Response:", tiktokResponse.data);
            const errorMessage = tiktokResponse.data.msg || "TikTok API request failed or returned unexpected data.";
            res.status(400).json({ status: false, message: errorMessage });
        }

    } catch (error) {
        console.error("Error proxying request to TikTok API:", error.response ? error.response.data : error.message);
        res.status(500).json({ status: false, message: "Failed to process request via TikTok API." });
    }
    // ---------------------------
});

// --- Health check endpoint ---
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", message: "API is running" });
});

// --- Start the server ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("PIN Mode Active with TikTok API Proxy.");
    console.log("Reading VALID_PINS from environment variable.");
    console.log("Currently accepted PINs (from env var):", validPins);
    console.log("Ensure VALID_PINS is set correctly in your Render environment settings.");
    console.log("Ensure 'axios' is installed (npm install axios) and listed in package.json.");
});

