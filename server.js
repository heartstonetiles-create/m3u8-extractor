import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "chrome-aws-lambda";

const app = express();

app.get("/", (req, res) => {
  res.json({
    message: "M3U8 Extractor (with frame sniffing) is running!",
    usage: "GET /getm3u8?url=YOUR_EMBED_URL"
  });
});

app.get("/getm3u8", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.json({ error: "Missing ?url parameter" });

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();

    // Spoof headers
    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115 Safari/537.36",
      "Referer": targetUrl,
    });

    let m3u8Found = null;

    // Capture ALL requests
    function captureRequests(pageOrFrame) {
      pageOrFrame.on("request", (req) => {
        const url = req.url();
        console.log("REQ:", url);

        if (url.includes(".m3u8")) {
          console.log("🎯 Found M3U8:", url);
          m3u8Found = url;
        }
        if (url.includes(".ts")) {
          console.log("🎯 Found TS:", url);
        }
      });
    }

    captureRequests(page);

    await page.goto(targetUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Also sniff every iframe/frame
    page.frames().forEach((frame) => captureRequests(frame));

    // Wait up to 20 seconds for streams
    await page.waitForTimeout(20000);

    await browser.close();

    if (m3u8Found) {
      res.json({ m3u8: m3u8Found });
    } else {
      res.json({
        error:
          "No .m3u8 link detected. Possibly hidden in JS or requires user interaction.",
      });
    }
  } catch (err) {
    if (browser) await browser.close();
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
