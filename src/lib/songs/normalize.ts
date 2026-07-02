const CHOSUNG = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

export function getChosung(value: string) {
  let output = "";

  for (const char of value) {
    const code = char.charCodeAt(0) - 44032;
    if (code >= 0 && code < 11172) {
      output += CHOSUNG[Math.floor(code / 588)];
    }
  }

  return output;
}
