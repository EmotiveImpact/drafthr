const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Critical test: stripSuggestionMarks does INS removals BEFORE DEL unwraps
// What if an <ins> is INSIDE a <del>?

function stripSuggestionMarks(html) {
  if (!html || (!html.includes("<ins") && !html.includes("<del"))) return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  
  console.log('Step 1: Remove all <ins>...');
  root.querySelectorAll("ins").forEach((el) => {
    console.log(`  Removing <ins>: "${el.textContent}"`);
    el.remove();
  });
  console.log('  After <ins> removal:', root.innerHTML);
  
  console.log('\nStep 2: Unwrap all <del>...');
  root.querySelectorAll("del").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) {
      console.log(`  Skipping <del> (no parent): "${el.textContent}"`);
      return;
    }
    console.log(`  Unwrapping <del>: "${el.textContent}"`);
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  console.log('  After <del> unwrap:', root.innerHTML);
  
  return root.innerHTML;
}

// Edge case: <del> wrapping <ins> with different status
console.log('=== Test: <del data-status="rejected"> wrapping <ins data-status="pending"> ===');
const html = '<p><del data-status="rejected">keep <ins data-status="pending">but drop this</ins> text</del></p>';
console.log('Input:', html);
const result = stripSuggestionMarks(html);
console.log('\nFinal result:', result);
console.log('\nAnalysis:');
console.log('- <ins> with pending status is removed (step 1)');
console.log('- <del> is then unwrapped, keeping its remaining children (step 2)');
console.log('- Result: "keep  text" (note: double space where <ins> was)');
