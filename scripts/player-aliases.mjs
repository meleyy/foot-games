import { normalizeName } from "./ea-ratings-api.mjs";

/**
 * ESPN / FIFA Index display name → EA commonName or displayName.
 * Keys are normalized for lookup.
 */
export const PLAYER_ALIASES = new Map(
  [
    ["Vinícius Júnior", "Vini Jr."],
    ["Gabriel Magalhães", "Gabriel"],
    ["Alex Sandro", "Alexsandro"],
    ["Alisson Becker", "Alisson"],
    ["Neymar", "Neymar Jr"],
    ["Brahim Díaz", "Brahim"],
    ["Kenan Yildiz", "Kenan Yıldız"],
    ["Altay Bayindir", "Altay Bayındır"],
    ["Son Heung-Min", "Heung Min Son"],
    ["Andy Robertson", "Andrew Robertson"],
    ["Mohamed Kanno", "Mohammed Kanno"],
    ["Aiman Yahya", "Ayman Yahya"],
    ["Manu Koné", "Kouadio Manu Koné"],
    ["Kou Itakura", "Ko Itakura"],
    ["Roger Ibañez", "Ibañez"],
    ["Marc Pubill", "Pubill"],
    ["Yassine Titraoui", "Yacine Titraoui"],
    ["Vitinha", "Vitinha"],
    ["Rodrygo", "Rodrygo"],
    ["Moteb Al-Harbi", "Muteb Al Harbi"],
    ["Abdullah Al-Hamdan", "Abdullah Al Hamdan"],
    ["Abdullah Al-Khaibari", "Abdullah Al Khaibari"],
    ["Abdulelah Al-Amri", "Abdulelah Al Amri"],
    ["Khalid Al-Ghannam", "Khalid Al Ghannam"],
    ["Mohammed Al-Owais", "Mohammed Al Owais"],
    ["Nasser Al-Dawsari", "Nasser Al Dawsari"],
    ["Nawaf Al-Aqidi", "Nawaf Al Aqidi"],
    ["Salem Al-Dawsari", "Salem Al Dawsari"],
    ["Ziyad Al-Johani", "Ziyad Al Johani"],
    ["Ala Al-Hajji", "Alaa Al Hajji"],
    ["Anis Hadj Moussa", "Anis Hadj-Moussa"],
    ["Alex Freeman", "Alexander Freeman"],
    ["Max Arfsten", "Maximilian Arfsten"],
    ["Pico Lopes", "Roberto Lopes"],
    ["Abde Ezzalzouli", "Abdessamad Ezzalzouli"],
    ["Aleksandar Pavlovic", "Aleksandar Pavlović"],
    ["Marko Arnautovic", "Marko Arnautović"],
    ["Sasa Kalajdzic", "Saša Kalajdžić"],
    ["Ajdin Hrustic", "Ajdin Hrustić"],
    ["Mohamed Toure", "Mohamed Touré"],
    ["Amar Dedic", "Amar Dedić"],
    ["Amir Hadziahmetovic", "Amir Hadžiahmetović"],
    ["Armin Gigovic", "Armin Gigović"],
    ["Benjamin Tahirovic", "Benjamin Tahirović"],
    ["Dennis Hadzikadunic", "Dennis Hadžikadunić"],
    ["Edin Dzeko", "Edin Džeko"],
    ["Ermedin Demirovic", "Ermedin Demirović"],
    ["Haris Tabakovic", "Haris Tabaković"],
    ["Sead Kolasinac", "Sead Kolašinac"],
    ["Kaishu Sano", "Kaishū Sano"],
    ["Luka Vuskovic", "Luka Vušković"],
  ].map(([db, ea]) => [normalizeName(db), ea]),
);

/** Fuzzy matches that must never be applied (DB name → blocked EA name). */
export const MATCH_BLOCKLIST = new Set(
  [
    ["James Rodríguez", "Steven Rodríguez"],
    ["Jorge Carrascal", "Rafael Carrascal"],
    ["Camilo Vargas", "Kerwin Vargas"],
    ["Hélio Varela", "Bruno Varela"],
    ["Kevin Pina", "Wagner Pina"],
    ["Assane Diao", "Ousmane Diao"],
    ["Bazoumana Touré", "Ben Hamed Touré"],
    ["Alisson Becker", "André Becker"],
    ["Júnior Alonso", "Wildo Alonso"],
    ["Juan Manuel Sanabria", "Lucas Sanabria"],
    ["Sebastián Cáceres", "Martín Cáceres"],
    ["Lee Tae-Seok", "Lim Yoo Seok"],
    ["Hossein Hosseini", "Majid Hosseini"],
    ["José Manuel López", "Julián López"],
    ["Frantzdy Pierrot", "Frantz Pierrot"],
    ["Baris Alper Yilmaz", "Berkay Yilmaz"],
    ["Deniz Gül", "Gökhan Gül"],
    ["Abdoulaye Seck", "Demba Seck"],
    ["Félix Torres", "Vicente Emanuel Torres"],
    ["Guillermo Varela", "José Varela"],
    ["Guillermo Martínez", "Luca Martínez Dupuy"],
    ["Tyler Fletcher", "Steven Fletcher"],
    ["Antoine Mendy", "Arial Mendy"],
    ["Tete Yengi", "Kusini Yengi"],
    ["Nico González", "Nicolás González"],
    ["Marco Pasalic", "Mario Pašalić"],
    ["Issa Diop", "Sofiane Diop"],
    ["Yehvann Diouf", "El Hadji Malick Diouf"],
    ["Mamadou Sarr", "Pape Matar Sarr"],
    ["Luiz Henrique", "Luis Henrique"],
    ["Luiz Henrique", "Caio Henrique"],
    ["Junnosuke Suzuki", "Zion Suzuki"],
    ["Junnosuke Suzuki", "Yuito Suzuki"],
    ["Yan Diomande", "Ousmane Diomande"],
    ["Yan Diomande", "Mohammed Diomande"],
    ["Santiago Arias", "Jorge Arias"],
    ["Santiago Arias", "Juan Arias"],
    ["Jhon Arias", "Jorge Arias"],
    ["Jhon Arias", "Juan Arias"],
    ["Mohanad Ali", "Ali Al Hamadi"],
    ["Mohanad Ali", "Hussein Ali"],
    ["Altay Bayindir", "Aris Bayindir"],
  ].map(([db, ea]) => `${normalizeName(db)}::${normalizeName(ea)}`),
);

export function aliasEaName(dbName) {
  return PLAYER_ALIASES.get(normalizeName(String(dbName ?? "").trim())) ?? null;
}

export function isBlockedMatch(dbName, eaName) {
  return MATCH_BLOCKLIST.has(
    `${normalizeName(String(dbName ?? "").trim())}::${normalizeName(String(eaName ?? "").trim())}`,
  );
}
