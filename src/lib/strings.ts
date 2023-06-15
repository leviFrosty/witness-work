// created by chat-gpt, used to prettify before exporting to sms export
export function prettifyJson(json: object): string {
  const jsonString = JSON.stringify(json, null, 2); // Indent with 2 spaces
  const prettifiedJson = jsonString
    .replace(/"([^"]+)":/g, '$1:') // Remove quotes around keys
    .replace(/"([^"]+)"/g, '$1') // Remove quotes around values
    .replace(/[{},]/g, '') // Remove braces and commas
    .replace(/\\"/g, '"') // Unescape remaining quotes
    .trim(); // Trim leading/trailing whitespace
  return prettifiedJson;
}
