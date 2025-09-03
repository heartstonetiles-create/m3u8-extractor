import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const app = express();

app.get("/", (req, res) => {
  res.json({
    message: "M3U8 Extractor is running with puppeteer-core + chromium!",
    usage: "GET /getm3u8?url=YOUR_EMBED_URL"
  });
});

app.get("/getm3u8", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.json({ error: "Missing ?url parameter" });
  }

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    // Fake headers to bypass some restrictions
    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/115 Safari/537.36",
      Referer: "https://embedsports.top/"
    });

    await page.goto(targetUrl, { waitUntil: "networkidle2" });

    const html = await page.content();

    // Extract .m3u8 link
    const regex = /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i;
    const match = html.match(regex);

    await browser.close();

    if (match) {
      res.json({ m3u8: match[1] });
    } else {
      res.json({ error: "No .m3u8 link found in embed page." });
    }
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ✅ Use Render's dynamic port
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
