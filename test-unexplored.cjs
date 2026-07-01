const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Replicate stripSuggestionMarks exactly
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

// UNTESTED edge case: <del> at document root with no parent
// This shouldn't happen in real HTML (del must be inside block), but let's check
console.log('=== Test: malformed HTML - <del> at potential root boundary ===');
const html1 = '<del>orphaned</del>';
const result1 = stripSuggestionMarks(html1);
console.log('Input:', html1);
console.log('Result:', result1);

// UNTESTED edge case: <del> wrapping ONLY other elements (no text nodes)
console.log('\n=== Test: <del> wrapping only block elements ===');
const html2 = '<div><del><p>para 1</p><p>para 2</p></del></div>';
const result2 = stripSuggestionMarks(html2);
console.log('Input:', html2);
console.log('Result:', result2);

// UNTESTED edge case: <del> containing comment nodes (shouldn't happen post-sanitize)
console.log('\n=== Test: attribute name case sensitivity ===');
const html3 = '<p><del DATA-STATUS="rejected">case test</del></p>';
const result3 = stripSuggestionMarks(html3);
console.log('Input:', html3);
console.log('Result:', result3);

// UNTESTED edge case: consecutive <del> elements (replacement where old is deleted)
console.log('\n=== Test: Verify <ins>/<del> both selector in applyMergeToDom ===');
// The applyMergeToDom uses selector: 'ins[data-suggestion-id], del[data-suggestion-id]'
// This requires data-suggestion-id to be present. What if it's missing?
const html4 = '<p><del>no attr</del><ins data-suggestion-id="i1">has attr</ins></p>';
const root4 = document.createElement("div");
root4.innerHTML = html4;
const found4 = root4.querySelectorAll('ins[data-suggestion-id], del[data-suggestion-id]');
console.log('Input:', html4);
console.log('Selector "ins[data-suggestion-id], del[data-suggestion-id]" finds:', found4.length, 'elements');
console.log('Result: first <del> is NOT selected (no data-suggestion-id)');
