import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "chrome-aws-lambda";

const app = express();

app.get("/", (req, res) => {
  res.json({
    message: "M3U8 Extractor running with puppeteer-core + chromium",
    usage: "GET /getm3u8?url=YOUR_EMBED_URL[&raw=1][&force=1]",
    debug: "GET /debug?url=YOUR_EMBED_URL",
  });
});

// Utility: Run with timeout
async function runWithTimeout(promise, ms, browser) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      if (browser) await browser.close();
      reject(new Error(`⏱ Timeout: operation took longer than ${ms / 1000}s`));
    }, ms);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

app.get("/getm3u8", async (req, res) => {
  const targetUrl = req.query.url;
  const raw = req.query.raw === "1"; // JSON debug mode
  const force = req.query.force === "1"; // Force always return .m3u8 file

  if (!targetUrl) return res.json({ error: "Missing ?url parameter" });

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115 Safari/537.36",
      Referer: targetUrl,
    });

    let m3u8Found = null;
    let tsSegments = [];

    function captureRequests(pageOrFrame) {
      pageOrFrame.on("request", (req) => {
        const url = req.url();
        console.log("REQ:", url);
        if (url.includes(".m3u8")) m3u8Found = url;
        if (url.includes(".ts")) tsSegments.push(url);
      });
    }

    captureRequests(page);

    await runWithTimeout(
      page.goto(targetUrl, {
        waitUntil: "networkidle2",
        timeout: 60000,
      }),
      30000,
      browser
    );

    page.frames().forEach((frame) => captureRequests(frame));

    // Try clicking play button
    try {
      await page.evaluate(() => {
        const btn =
          document.querySelector("button[aria-label='Play'], .vjs-big-play-button, .play, video");
        if (btn) (btn as HTMLElement).click();
      });
    } catch {
      console.log("⚠️ No play button found");
    }

    await page.waitForTimeout(15000);
    await browser.close();

    // JSON debug mode
    if (raw) {
      if (m3u8Found) return res.json({ m3u8: m3u8Found });
      if (tsSegments.length > 0) return res.json({ ts: tsSegments });
      return res.json({ error: "No .m3u8 or .ts links detected" });
    }

    // Force always return .m3u8 text
    if (force) {
      const playlist = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:10",
        "#EXT-X-MEDIA-SEQUENCE:0",
      ];

      if (m3u8Found) {
        playlist.push(`#EXTINF:10.0,`);
        playlist.push(m3u8Found);
      } else {
        tsSegments.forEach((url) => {
          playlist.push("#EXTINF:10.0,");
          playlist.push(url);
        });
      }

      playlist.push("#EXT-X-ENDLIST");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Content-Disposition", "inline; filename=generated.m3u8");
      return res.send(playlist.join("\n"));
    }

    // Normal mode
    if (m3u8Found) {
      res.redirect(m3u8Found);
    } else if (tsSegments.length > 0) {
      const playlist = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:10",
        "#EXT-X-MEDIA-SEQUENCE:0",
      ];

      tsSegments.forEach((url) => {
        playlist.push("#EXTINF:10.0,");
        playlist.push(url);
      });

      playlist.push("#EXT-X-ENDLIST");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Content-Disposition", "inline; filename=generated.m3u8");
      res.send(playlist.join("\n"));
    } else {
      res.json({
        error: "No .m3u8 or .ts links detected. Could be WebRTC or hidden deeper.",
      });
    }
  } catch (err) {
    if (browser) await browser.close();
    res.json({ error: err.message });
  }
});

// Debug endpoint with timeout
app.get("/debug", async (req, res) => {
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
    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115 Safari/537.36",
      Referer: targetUrl,
    });

    const log = [];

    page.on("request", (req) => {
      log.push({ type: "request", url: req.url(), method: req.method() });
    });

    page.on("response", (resp) => {
      log.push({ type: "response", url: resp.url(), status: resp.status() });
    });

    await runWithTimeout(
      page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }),
      30000,
      browser
    );

    await page.waitForTimeout(10000);
    await browser.close();

    res.json({ url: targetUrl, log });
  } catch (err) {
    if (browser) await browser.close();
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
