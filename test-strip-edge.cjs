const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

function stripSuggestionMarks(html) {
  if (!html || (!html.includes("<ins") && !html.includes("<del"))) return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  root.querySelectorAll("ins").forEach((el) => el.remove());
  root.querySelectorAll("del").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  return root.innerHTML;
}

// CRITICAL edge case: What if DOMPurify's USE_PROFILES permits <del> and we get:
// <p><del data-status="accepted">text</del></p>
// And the intention is for this to be removed entirely by the export path?
// stripSuggestionMarks will unwrap it (keeping "text"), which is WRONG for export!

// Actually, wait. Let me reread the comment at line 180-188:
// "callers run mergeAcceptedSuggestionsHtml(..., {forExport:true}) first"
// So the mergeAcceptedSuggestionsHtml should have already handled the accepted deletions.

// But what if mergeAcceptedSuggestionsHtml is NOT called? Then we get residual <del>.
// stripSuggestionMarks will unwrap it (keeping text).
// For export, an accepted deletion should NOT have any text in the output!

console.log('=== CRITICAL Test: Residual <del status="accepted"> in export ===');
const html = '<p>keep <del data-status="accepted">should be gone</del> end</p>';
const result = stripSuggestionMarks(html);
console.log('Input:', html);
console.log('Result:', result);
console.log('BUG?: "should be gone" text appears in export!');

// The comment says "callers run mergeAcceptedSuggestionsHtml first"
// But stripSuggestionMarks doesn't distinguish between:
// - accepted deletion (should remove text for export)
// - rejected deletion (should keep text)
// - pending deletion (should keep text)
// It UNWRAPS all <del> tags equally.

// For AUTHORING mode (normal sanitize), this is OK because rejected marks stay
// wrapped. But for EXPORT mode, stripSuggestionMarks is used AFTER merging,
// so it should only see residual <del> that are rejected or pending (not accepted).
// The comment claims merging happens first, so this should be fine.

// But what if there's a bug in mergeAcceptedSuggestionsHtml or the caller forgets to call it?
console.log('\n=== Scenario: mergeAcceptedSuggestionsHtml NOT called before export sanitize ===');
console.log('Expected: stripSuggestionMarks should remove accepted <del> text');
console.log('Actual: stripSuggestionMarks unwraps all <del>, keeping text regardless of status');
console.log('Result: exported file contains text that was explicitly marked for deletion!');
