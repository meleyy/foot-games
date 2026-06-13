import { parseTeamHtml } from "./fifaindex-scraper.mjs";

const nationSample = `
<table class="w-full text-sm"><thead><tr>
<th>#</th><th>Player</th><th>Position</th><th>Team</th><th>OVR</th><th>POT</th>
</tr></thead><tbody><tr>
<td>1</td><td><a href="/players/204485-riyad-mahrez">Riyad Mahrez</a></td>
<td>RM</td><td>Al Ahli</td><td>84</td><td>84</td>
</tr></tbody></table>
`;

const teamSample = `
<table><thead><tr>
<th>#</th><th>Player</th><th>Nation</th><th>Pos</th><th>Age</th><th>OVR</th><th>POT</th>
</tr></thead><tbody><tr>
<td>10</td><td><a href="/players/231747-kylian-mbappe">Kylian Mbappé</a></td>
<td>France</td><td>ST</td><td>26</td><td>91</td><td>92</td>
</tr></tbody></table>
`;

const nationPlayers = parseTeamHtml(nationSample);
const teamPlayers = parseTeamHtml(teamSample);

console.log("nation", nationPlayers[0]);
console.log("team", teamPlayers[0]);

if (nationPlayers[0]?.rating !== 8.4) {
  throw new Error("Nation layout parse failed");
}

if (teamPlayers[0]?.rating !== 9.1) {
  throw new Error("Team layout parse failed");
}

console.log("OK");
