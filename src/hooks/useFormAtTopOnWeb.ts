/**
 * Whether a form in a browser starts at the top rather than docked near the
 * thumb. Only the web does (`useFormAtTopOnWeb.web.ts`): a phone's fields sit
 * just above the keyboard, and native never reads the browser's media queries.
 */
export default function useFormAtTopOnWeb() {
  return false
}
