const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Test edge case: <ins> positioned BETWEEN block elements with different parents
console.log('=== Test: <ins> across different parent contexts ===');
const html = '<div><p>para1<ins data-status="accepted" data-suggestion-id="x1">inserted</ins></p><p>para2</p></div>';
const root = document.createElement('div');
root.innerHTML = html;
const nodes = Array.from(root.querySelectorAll('ins[data-suggestion-id]'));
console.log('Starting HTML:', root.innerHTML);
for (const el of nodes) {
  if (el.parentNode) {
    console.log('Element parent:', el.parentNode.tagName);
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.parentNode.removeChild(el);
  }
}
console.log('Result:', root.innerHTML);

// Critical edge case: What if parentNode becomes null during iteration?
console.log('\n=== Test: parentNode check in loop ===');
const html2 = '<p><ins data-suggestion-id="a">one</ins><ins data-suggestion-id="b">two</ins></p>';
const root2 = document.createElement('div');
root2.innerHTML = html2;
const nodes2 = Array.from(root2.querySelectorAll('ins'));
console.log('Found', nodes2.length, 'elements');
for (const el of nodes2) {
  console.log('Processing element with id:', el.getAttribute('data-suggestion-id'));
  if (!el.parentNode) {
    console.log('  -> parentNode is null, skipping');
    continue;
  }
  while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
  el.parentNode.removeChild(el);
  console.log('  -> removed');
}
console.log('Result:', root2.innerHTML);
