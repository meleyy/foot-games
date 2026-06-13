import { chromium } from "playwright";

const guesses = [
  "1335-france",
  "54-brazil",
  "1362-spain",
  "38-germany",
  "1318-argentina",
  "1330-england",
  "1334-portugal",
  "1337-netherlands",
  "1340-italy",
  "1329-belgium",
  "1338-croatia",
  "1354-mexico",
  "1386-united-states",
  "1352-japan",
  "1366-korea-republic",
  "1370-morocco",
  "1376-senegal",
  "1377-qatar",
];

const launchOptions = {
  headless: process.env.FIFAINDEX_HEADED !== "true",
};
if (process.env.FIFAINDEX_CHANNEL) {
  launchOptions.channel = process.env.FIFAINDEX_CHANNEL;
}
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
await page.setExtraHTTPHeaders({
  "Accept-Language": "en-US,en;q=0.9",
});
await page.goto("https://fifaindex.com/teams/1335-france/fc26", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForSelector("table tbody tr a[href*='/players/']", {
  timeout: 120000,
});

for (const slug of guesses) {
  const url = `https://fifaindex.com/teams/${slug}/fc26`;
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const title = await page.title();
  const ok = response?.ok() && !title.includes("not found");
  console.log(ok ? "OK" : "NO", slug, title.split("–")[0].trim());
}

await browser.close();
