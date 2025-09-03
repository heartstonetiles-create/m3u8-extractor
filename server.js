import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 10000;

async function getFreshM3U8(embedUrl) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });
  const page = await browser.newPage();
  let m3u8 = null;

  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes(".m3u8")) {
      m3u8 = url;
    }
  });

  await page.goto(embedUrl, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForTimeout(6000);
  await browser.close();

  return m3u8;
}

app.get("/getm3u8", async (req, res) => {
  const embedUrl = req.query.url;
  if (!embedUrl) return res.status(400).send("Missing ?url");

  try {
    const m3u8 = await getFreshM3U8(embedUrl);
    if (m3u8) {
      res.send(m3u8);
    } else {
      res.status(404).send("No .m3u8 found");
    }
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
