import express from "express";
import puppeteer from "puppeteer";

const app = express();

app.get("/", (req, res) => {
  res.json({
    message: "✅ M3U8 Extractor running with puppeteer",
    usage: "GET /getm3u8?url=YOUR_EMBED_URL[&raw=1][&force=1]"
  });
});

app.get("/getm3u8", async (req, res) => {
  const targetUrl = req.query.url;
  const raw = req.query.raw === "1";
  const force = req.query.force === "1";

  if (!targetUrl) return res.json({ error: "Missing ?url parameter" });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: puppeteer.executablePath() // ✅ ensures Render finds Chrome
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115 Safari/537.36",
      Referer: targetUrl
    });

    let m3u8Found = null;
    let tsSegments = [];

    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(".m3u8")) m3u8Found = url;
      if (url.includes(".ts")) tsSegments.push(url);
    });

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    try {
      await page.evaluate(() => {
        const btn =
          document.querySelector("button[aria-label='Play'], .vjs-big-play-button, .play, video");
        if (btn) btn.click();
      });
    } catch {
      console.log("⚠️ No play button found");
    }

    // ⏳ Replacement for deprecated page.waitForTimeout
    await new Promise((r) => setTimeout(r, 15000));

    await browser.close();

    // raw mode
    if (raw) {
      if (m3u8Found) return res.json({ m3u8: m3u8Found });
      if (tsSegments.length > 0) return res.json({ ts: tsSegments });
      return res.json({ error: "No .m3u8 or .ts links detected" });
    }

    // force mode → build fake playlist
    if (force) {
      const playlist = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:10",
        "#EXT-X-MEDIA-SEQUENCE:0"
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
      return res.send(playlist.join("\n"));
    }

    // default behavior
    if (m3u8Found) {
      res.redirect(m3u8Found);
    } else if (tsSegments.length > 0) {
      const playlist = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:10",
        "#EXT-X-MEDIA-SEQUENCE:0"
      ];
      tsSegments.forEach((url) => {
        playlist.push("#EXTINF:10.0,");
        playlist.push(url);
      });
      playlist.push("#EXT-X-ENDLIST");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.send(playlist.join("\n"));
    } else {
      res.json({
        error: "No .m3u8 or .ts links detected. Could be WebRTC or hidden deeper."
      });
    }
  } catch (err) {
    if (browser) await browser.close();
    console.error("❌ ERROR:", err);
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
