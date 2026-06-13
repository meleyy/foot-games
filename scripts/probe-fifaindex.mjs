import fs from "node:fs";

const r = await fetch("https://fifaindex.com/assets/TeamDetailView-_E13_8de.js", {
  headers: { "User-Agent": "Mozilla/5.0" },
});
console.log("status", r.status, "len", (await r.text()).length);
