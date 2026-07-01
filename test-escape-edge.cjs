const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Test escapeAttr with tricky inputs
function escapeAttr(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Edge case: author name with ampersand that's ALREADY escaped in input
console.log('=== Test: Already-escaped ampersand in author ===');
const author1 = 'Claude & AI';
console.log('Input:', author1);
console.log('escapeAttr output:', escapeAttr(author1));
console.log('Expected: Claude &amp; AI');

// Edge case: entity-like string in author
console.log('\n=== Test: Entity-like string in author ===');
const author2 = 'Claude &nbsp; AI';
console.log('Input:', author2);
console.log('escapeAttr output:', escapeAttr(author2));
console.log('Note: &nbsp; becomes &amp;nbsp;');

// Edge case: text containing already-escaped entities
console.log('\n=== Test: Already-escaped entity in text ===');
const text = 'Hello &lt;world&gt;';
console.log('Input:', text);
console.log('escapeHtml output:', escapeHtml(text));
console.log('Result: double-escaped: &amp;lt;world&amp;gt;');
console.log('This is CORRECT - we escape the input text as-is');

// Test the HTML round-trip
console.log('\n=== Test: HTML round-trip ===');
const html = `<p><ins data-author="${escapeAttr(author1)}">${escapeHtml(text)}</ins></p>`;
console.log('Generated HTML:', html);
const root = document.createElement('div');
root.innerHTML = html;
const ins = root.querySelector('ins');
console.log('After DOM parsing:');
console.log('  author attr:', ins.getAttribute('data-author'));
console.log('  text content:', ins.textContent);
