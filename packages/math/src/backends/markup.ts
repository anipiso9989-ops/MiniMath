const entities: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\r": "&#13;" };

export function escapeText(text: string): string {
  return text.replace(/[&<>\r]/g, (value) => entities[value]);
}
