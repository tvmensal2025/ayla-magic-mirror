// Mapa DDD → UF brasileiro. Usado para detectar a região do consultor
// a partir do número de WhatsApp conectado.
export const DDD_TO_UF: Record<string, string> = {
  // SP
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP",
  "16": "SP", "17": "SP", "18": "SP", "19": "SP",
  // RJ / ES
  "21": "RJ", "22": "RJ", "24": "RJ",
  "27": "ES", "28": "ES",
  // MG
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  // PR / SC
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  // RS
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  // DF / GO / TO / MT / MS
  "61": "DF",
  "62": "GO", "64": "GO",
  "63": "TO",
  "65": "MT", "66": "MT",
  "67": "MS",
  // AC / RO / RR / AM / PA / AP / MA
  "68": "AC", "69": "RO",
  "92": "AM", "97": "AM",
  "95": "RR",
  "91": "PA", "93": "PA", "94": "PA",
  "96": "AP",
  "98": "MA", "99": "MA",
  // PI / CE / RN / PB / PE / AL / SE / BA
  "86": "PI", "89": "PI",
  "85": "CE", "88": "CE",
  "84": "RN",
  "83": "PB",
  "81": "PE", "87": "PE",
  "82": "AL",
  "79": "SE",
  "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
};

export function ufFromPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  // formatos: 55XXNNNNNNNNN (13), XXNNNNNNNNN (11), XXNNNNNNNN (10)
  let ddd = "";
  if (d.length === 13 && d.startsWith("55")) ddd = d.slice(2, 4);
  else if (d.length === 11 || d.length === 10) ddd = d.slice(0, 2);
  else if (d.length >= 12) ddd = d.slice(2, 4);
  return DDD_TO_UF[ddd] || null;
}
