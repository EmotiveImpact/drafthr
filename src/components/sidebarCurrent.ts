/**
 * Which sidebar row is current on the new-letter pages (CREATE-X34, decided
 * by the lead): the templates page itself (/hr/new, /me/new) marks
 * Templates; the step-by-step wizard for one letter type (/hr/new/warning)
 * is part of writing a letter, so it marks Letters, with the recent letters
 * open under it, as the new-letter mock shows.
 */

/** /hr/new/warning or /me/new/offer: the wizard for one letter type. */
export function isLetterWizardPath(path: string): boolean {
  return /^\/(hr|me)\/new\/[^/]+/.test(path);
}

/** /hr/new or /me/new (with or without a trailing slash), not the wizard under it. */
export function isTemplatesPage(path: string, prefix: string): boolean {
  return path === `${prefix}/new` || path === `${prefix}/new/`;
}
