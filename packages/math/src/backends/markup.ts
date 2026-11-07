const entities: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\r": "&#13;", '"': "&quot;" };

export function escapeText(text: string): string {
  return text.replace(/[&<>\r]/g, (value) => entities[value]);
}

export function escapeAttribute(value: string): string {
  return value.replace(/[&<>"\r]/g, (char) => entities[char]);
}
