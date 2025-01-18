const express = require("express"); // This imports express
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const cors = require("cors");
const fs = require("fs");
const axios = require("axios");
const path = require("path");

puppeteer.use(StealthPlugin());

const app = express();  // Initialize express
app.use(cors());
app.use(express.static("public"));
const PORT = process.env.PORT || 3000;

// Ensure "public/images" directory exists
const imageDir = path.join(__dirname, "public", "images");
if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.0.0 Safari/537.36",
];

// Function to download and save profile images
async function downloadImage(url, filename) {
    try {
        const response = await axios({ url, responseType: "stream" });
        const filepath = path.join(imageDir, filename);
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });
    } catch (error) {
        console.error("❌ Failed to download image:", error.message);
    }
}

// Scraping TikTok profile
app.get("/scrape/:username", async (req, res) => {
    const username = req.params.username;
    const url = `https://www.tiktok.com/@${username}`;

    console.log(`🔍 Attempting to scrape TikTok profile: ${url}`);

    let browser;

    try {
        browser = await puppeteer.launch({
            headless: true, // Set to false for debugging
            args: [
                "--no-sandbox", // Avoid issues with sandboxing on Windows
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
            ignoreDefaultArgs: ["--enable-automation"],
        });

        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]);
        await page.setViewport({ width: 1280, height: 720 });

        console.log(`⏳ Navigating to TikTok profile...`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        // Wait longer for elements to load (increase timeout)
        await page.waitForSelector('div[class*="CreatorPageHeaderTextContainer"], div[class*="e1457k4r14"]', { timeout: 20000 });

        // Extract profile picture
        const profilePicUrl = await page.evaluate(() => {
            let img = document.querySelector("img");
            return img ? img.src || img.getAttribute("data-src") : null;
        });

        if (profilePicUrl) {
            await downloadImage(profilePicUrl, `${username}.jpg`);
        }

        // Extract profile info with multiple selector fallback
        const profileInfo = await page.evaluate(() => {
            const element = document.querySelector('div[class*="CreatorPageHeaderTextContainer"], div[class*="e1457k4r14"]');
            return element ? element.innerText.trim() : "No profile info found.";
        });

        // Extract external links (like social media links)
        const extractedLinks = await page.evaluate(() => {
            const links = [];
            const linkContainer = document.querySelector('div[class*="CreatorPageHeaderTextContainer"], div[class*="e1457k4r14"]');
            if (linkContainer) {
                const linkElements = linkContainer.querySelectorAll("a");
                linkElements.forEach(link => {
                    links.push({ text: link.innerText, url: link.href });
                });
            }
            return links;
        });

        // Check for Linktree links
        const linktreeLinks = extractedLinks.filter(link => link.url.includes("linktr.ee"));
        
        if (linktreeLinks.length > 0) {
            console.log(`🔍 Found Linktree URLs:`, linktreeLinks);
            for (let link of linktreeLinks) {
                console.log(`⏳ Scraping Linktree URL: ${link.url}`);
                await page.goto(link.url, { waitUntil: "domcontentloaded", timeout: 60000 });

                // Extract all the links inside the Linktree page
                const linktreeLinksData = await page.evaluate(() => {
                    const links = [];
                    document.querySelectorAll("a").forEach(link => {
                        links.push({ text: link.innerText, url: link.href });
                    });
                    return links;
                });

                extractedLinks.push(...linktreeLinksData); // Add Linktree links to the profile links
            }
        }

        console.log(`🖼️ Extracted Profile Picture: ${profilePicUrl}`);
        console.log(`📌 Extracted Profile Info: ${profileInfo}`);

        await browser.close();

        res.json({
            status: 'success',
            profilePic: `/images/${username}.jpg`,
            profileInfo: profileInfo,
            extractedLinks: extractedLinks || [],
        });

    } catch (error) {
        if (browser) {
            await browser.close();
        }
        console.error(`❌ Error scraping ${username}:`, error);
        res.json({ 
            status: 'failed', 
            error: `Failed to retrieve data for ${username}. Error: ${error.message}` 
        });
    }
});

// Start the Express server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
