const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Replicate stripSuggestionMarks logic
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

// Edge case: <del> whose parent is itself removed by a PRECEDING <del>?
console.log('=== Test: Chained <del> removals ===');
const html1 = '<p><del><del data-id="inner">nested text</del></del>after</p>';
const result1 = stripSuggestionMarks(html1);
console.log('Input:', html1);
console.log('Result:', result1);

// Edge case: <del> with <ins> inside (rejected deletion containing pending insertion)
console.log('\n=== Test: <del> containing <ins> ===');
const html2 = '<p>start <del data-status="rejected"><ins data-status="pending">unwanted proposal inside rejection</ins> original text</del> end</p>';
const result2 = stripSuggestionMarks(html2);
console.log('Input:', html2);
console.log('Result:', result2);
console.log('Note: <del> unwraps (keeping children), but <ins> still there!');

// Critical: stripSuggestionMarks removes ALL <ins>, then unwraps ALL <del>
// If a <del> had an <ins> child, the <ins> is ALREADY GONE when we unwrap the <del>
console.log('\n=== Test: Order of operations matters ===');
const html3 = '<p>x <del data-id="d1">y <ins data-id="i1">z</ins> w</del> q</p>';
console.log('Input:', html3);
const root3 = document.createElement("div");
root3.innerHTML = html3;
// Step 1: remove all <ins>
root3.querySelectorAll("ins").forEach((el) => {
  console.log('  Removing <ins>', el.textContent);
  el.remove();
});
console.log('  After removing <ins>:', root3.innerHTML);
// Step 2: unwrap all <del>
root3.querySelectorAll("del").forEach((el) => {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
});
console.log('  After unwrapping <del>:', root3.innerHTML);
