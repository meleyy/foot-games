export const WORLD_CUP_2026_GROUPS = {
  A: ["Mexique", "Afrique du Sud", "République de Corée", "Tchéquie"],
  B: ["Canada", "Bosnie-Herzégovine", "Qatar", "Suisse"],
  C: ["Brésil", "Maroc", "Haïti", "Écosse"],
  D: ["États-Unis", "Paraguay", "Australie", "Turquie"],
  E: ["Allemagne", "Curaçao", "Côte d'Ivoire", "Équateur"],
  F: ["Pays-Bas", "Japon", "Suède", "Tunisie"],
  G: ["Belgique", "Égypte", "Iran", "Nouvelle-Zélande"],
  H: ["Espagne", "Cap Vert", "Arabie Saoudite", "Uruguay"],
  I: ["France", "Sénégal", "Irak", "Norvège"],
  J: ["Argentine", "Algérie", "Autriche", "Jordanie"],
  K: ["Portugal", "RD Congo", "Ouzbékistan", "Colombie"],
  L: ["Angleterre", "Croatie", "Ghana", "Panama"],
};

export const WORLD_CUP_2026_NATIONS = Object.values(WORLD_CUP_2026_GROUPS).flat();

export const EA_NATION_NAMES = {
  Mexique: "Mexico",
  "Afrique du Sud": "South Africa",
  "République de Corée": "Korea Republic",
  Tchéquie: "Czech Republic",
  Canada: "Canada",
  "Bosnie-Herzégovine": "Bosnia and Herzegovina",
  Qatar: "Qatar",
  Suisse: "Switzerland",
  Brésil: "Brazil",
  Maroc: "Morocco",
  Haïti: "Haiti",
  Écosse: "Scotland",
  "États-Unis": "United States",
  Paraguay: "Paraguay",
  Australie: "Australia",
  Turquie: "Turkey",
  Allemagne: "Germany",
  Curaçao: "Curaçao",
  "Côte d'Ivoire": "Côte d'Ivoire",
  Équateur: "Ecuador",
  "Pays-Bas": "Holland",
  Japon: "Japan",
  Suède: "Sweden",
  Tunisie: "Tunisia",
  Belgique: "Belgium",
  Égypte: "Egypt",
  Iran: "Iran",
  "Nouvelle-Zélande": "New Zealand",
  Espagne: "Spain",
  "Cap Vert": "Cape Verde Islands",
  "Arabie Saoudite": "Saudi Arabia",
  Uruguay: "Uruguay",
  France: "France",
  Sénégal: "Senegal",
  Irak: "Iraq",
  Norvège: "Norway",
  Argentine: "Argentina",
  Algérie: "Algeria",
  Autriche: "Austria",
  Jordanie: "Jordan",
  Portugal: "Portugal",
  "RD Congo": "Congo DR",
  Ouzbékistan: "Uzbekistan",
  Colombie: "Colombia",
  Angleterre: "England",
  Croatie: "Croatia",
  Ghana: "Ghana",
  Panama: "Panama",
};

export function worldCupEaNationNames() {
  return WORLD_CUP_2026_NATIONS.map(
    (nation) => EA_NATION_NAMES[nation] ?? nation,
  );
}

export const EA_TO_FRENCH = Object.fromEntries(
  Object.entries(EA_NATION_NAMES).map(([french, ea]) => [ea, french]),
);

export function frenchNationName(eaName) {
  return EA_TO_FRENCH[eaName] ?? eaName;
}

export const ESPN_TO_FRENCH = {
  Algeria: "Algérie",
  Argentina: "Argentine",
  Australia: "Australie",
  Austria: "Autriche",
  Belgium: "Belgique",
  "Bosnia-Herzegovina": "Bosnie-Herzégovine",
  Brazil: "Brésil",
  Canada: "Canada",
  "Cape Verde": "Cap Vert",
  Colombia: "Colombie",
  "Congo DR": "RD Congo",
  Croatia: "Croatie",
  Curaçao: "Curaçao",
  Czechia: "Tchéquie",
  Ecuador: "Équateur",
  Egypt: "Égypte",
  England: "Angleterre",
  France: "France",
  Germany: "Allemagne",
  Ghana: "Ghana",
  Haiti: "Haïti",
  Iran: "Iran",
  Iraq: "Irak",
  "Ivory Coast": "Côte d'Ivoire",
  Japan: "Japon",
  Jordan: "Jordanie",
  Mexico: "Mexique",
  Morocco: "Maroc",
  Netherlands: "Pays-Bas",
  "New Zealand": "Nouvelle-Zélande",
  Norway: "Norvège",
  Panama: "Panama",
  Paraguay: "Paraguay",
  Portugal: "Portugal",
  Qatar: "Qatar",
  "Saudi Arabia": "Arabie Saoudite",
  Scotland: "Écosse",
  Senegal: "Sénégal",
  "South Africa": "Afrique du Sud",
  "South Korea": "République de Corée",
  Spain: "Espagne",
  Sweden: "Suède",
  Switzerland: "Suisse",
  Tunisia: "Tunisie",
  Türkiye: "Turquie",
  "United States": "États-Unis",
  Uruguay: "Uruguay",
  Uzbekistan: "Ouzbékistan",
};

export function frenchFromEspnName(espnName) {
  return ESPN_TO_FRENCH[espnName] ?? espnName;
}

export function eaNationNameFromFrench(frenchName) {
  return EA_NATION_NAMES[frenchName] ?? frenchName;
}
