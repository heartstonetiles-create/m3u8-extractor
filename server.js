import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "chrome-aws-lambda";

const app = express();

app.get("/", (req, res) => {
  res.json({
    message: "M3U8 Extractor running with puppeteer-core",
    usage: "GET /getm3u8?url=YOUR_EMBED_URL[&raw=1][&force=1]",
  });
});

app.get("/getm3u8", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.json({ error: "Missing ?url parameter" });

  let browser;
  try {
    let executablePath = await chromium.executablePath;

    // ✅ Fallback for Render (non-Lambda)
    if (!executablePath) {
      executablePath = "/usr/bin/google-chrome-stable";
    }

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();

    // Log requests for debugging
    page.on("request", (req) => console.log("REQ:", req.url()));

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for a while to capture m3u8
    await page.waitForTimeout(15000);

    let m3u8Found = null;
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(".m3u8")) m3u8Found = url;
    });

    await browser.close();

    if (m3u8Found) {
      return res.json({ m3u8: m3u8Found });
    } else {
      return res.json({ error: "No .m3u8 link found" });
    }
  } catch (err) {
    if (browser) await browser.close();
    console.error("❌ ERROR:", err);
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
