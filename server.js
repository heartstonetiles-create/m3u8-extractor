import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const app = express();

app.get("/", (req, res) => {
  res.json({
    message: "M3U8 Extractor (with merged playlist export)",
    usage: "GET /getm3u8?url=YOUR_EMBED_URL&format=file"
  });
});

app.get("/getm3u8", async (req, res) => {
  const targetUrl = req.query.url;
  const format = req.query.format || "json"; // default JSON

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

    let m3u8Links = [];
    let tsLinks = [];

    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(".m3u8")) m3u8Links.push(url);
      if (url.includes(".ts")) tsLinks.push(url);
    });

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/115 Safari/537.36",
      Referer: "https://embedsports.top/"
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(10000); // watch requests for 10s

    await browser.close();

    const uniqueM3u8 = [...new Set(m3u8Links)];
    const uniqueTs = [...new Set(tsLinks)];

    // ---------- FILE MODE ----------
    if (format === "file") {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Content-Disposition", "attachment; filename=stream.m3u8");

      if (uniqueM3u8.length > 0) {
        // Direct playlist available
        return res.send(uniqueM3u8[0]);
      }

      if (uniqueTs.length > 0) {
        // Build custom playlist from .ts
        const playlist = [
          "#EXTM3U",
          "#EXT-X-VERSION:3",
          "#EXT-X-TARGETDURATION:6",
          "#EXT-X-MEDIA-SEQUENCE:0",
          ...uniqueTs.slice(0, 20).map((url) => `#EXTINF:6.0,\n${url}`),
          "#EXT-X-ENDLIST"
        ].join("\n");

        return res.send(playlist);
      }

      return res.send("#EXTM3U\n# No streams detected");
    }

    // ---------- JSON MODE ----------
    const result = {};
    if (uniqueM3u8.length > 0) result.m3u8 = uniqueM3u8;
    if (uniqueTs.length > 0) {
      result.ts_segments = uniqueTs.slice(0, 10);
      result.generated_playlist = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-MEDIA-SEQUENCE:0",
        ...uniqueTs.slice(0, 10).map((url) => `#EXTINF:6.0,\n${url}`),
        "#EXT-X-ENDLIST"
      ].join("\n");
    }
    if (!uniqueM3u8.length && !uniqueTs.length) {
      result.error = "No .m3u8 or .ts links detected in 10s window.";
    }

    res.json(result);
  } catch (err) {
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
