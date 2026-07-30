const PALETTE = [
  { bg: '#f0e9ff', border: '#beaaf2', text: '#4a3a7a' },
  { bg: '#e8f4ff', border: '#94c8ff', text: '#1e4a7a' },
  { bg: '#e8f8ef', border: '#6bcf8e', text: '#1e5a35' },
  { bg: '#fff3e6', border: '#faad14', text: '#7a4e00' },
  { bg: '#ffe8ef', border: '#f759ab', text: '#7a1f45' },
  { bg: '#e6fffb', border: '#36cfc9', text: '#006d68' },
  { bg: '#f5f0e6', border: '#d4a373', text: '#5c4030' },
  { bg: '#eef0ff', border: '#8590ff', text: '#2a327a' },
];

export function courseColor(courseId: string) {
  let h = 0;
  for (let i = 0; i < courseId.length; i++) {
    h = (h * 31 + courseId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
