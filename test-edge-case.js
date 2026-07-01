const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Test edge case 1: nested <ins> with reordered attributes
console.log('=== Test 1: Nested <ins> unwrap ===');
const html1 = '<p><strong>prefix <ins data-status="accepted" data-suggestion-id="s1" data-suggestion-kind="insertion">content</ins> suffix</strong></p>';
const root1 = document.createElement('div');
root1.innerHTML = html1;
const nodes1 = Array.from(root1.querySelectorAll('ins[data-suggestion-id]'));
for (const el of nodes1) {
  if (el.parentNode) {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.parentNode.removeChild(el);
  }
}
console.log('Result:', root1.innerHTML);

// Test edge case 2: <del> with nested child elements
console.log('\n=== Test 2: <del> unwrap with nested children ===');
const html2 = '<p>keep <del data-status="rejected" data-suggestion-id="d1"><strong>bold original</strong> text</del> end</p>';
const root2 = document.createElement('div');
root2.innerHTML = html2;
const nodes2 = Array.from(root2.querySelectorAll('del[data-suggestion-id]'));
for (const el of nodes2) {
  if (el.parentNode) {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.parentNode.removeChild(el);
  }
}
console.log('Result:', root2.innerHTML);

// Test edge case 3: Chained <ins>/<del> side by side (replacement)
console.log('\n=== Test 3: Chained <ins> then <del> (replacement) ===');
const html3 = '<p>start <del data-status="accepted" data-suggestion-id="d2">old</del><ins data-status="accepted" data-suggestion-id="i2">new</ins> end</p>';
const root3 = document.createElement('div');
root3.innerHTML = html3;
const nodes3 = Array.from(root3.querySelectorAll('ins[data-suggestion-id], del[data-suggestion-id]'));
for (const el of nodes3) {
  if (!el.parentNode) continue;
  const tag = el.tagName.toLowerCase();
  const status = el.getAttribute('data-status') ?? 'pending';
  if (tag === 'del' && status === 'accepted') {
    el.parentNode.removeChild(el);
  } else if (tag === 'ins' && status === 'accepted') {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.parentNode.removeChild(el);
  }
}
console.log('Result:', root3.innerHTML);

// Test edge case 4: <ins> with table cell (self-closing-ish context)
console.log('\n=== Test 4: <ins> inside table cell ===');
const html4 = '<table><tr><td><ins data-status="accepted" data-suggestion-id="t1">new cell content</ins></td></tr></table>';
const root4 = document.createElement('div');
root4.innerHTML = html4;
const nodes4 = Array.from(root4.querySelectorAll('ins[data-suggestion-id]'));
for (const el of nodes4) {
  if (el.parentNode) {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.parentNode.removeChild(el);
  }
}
console.log('Result:', root4.innerHTML);

// Test edge case 5: Del with strikethrough text + inline styles
console.log('\n=== Test 5: <del> with inline styles ===');
const html5 = '<p>keep <del data-status="rejected" data-suggestion-id="s5" style="color:red">original <em>styled</em> text</del> end</p>';
const root5 = document.createElement('div');
root5.innerHTML = html5;
const nodes5 = Array.from(root5.querySelectorAll('del[data-suggestion-id]'));
for (const el of nodes5) {
  if (el.parentNode) {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.parentNode.removeChild(el);
  }
}
console.log('Result:', root5.innerHTML);

// Test edge case 6: Multiple <ins> next to each other with one accepted, one pending
console.log('\n=== Test 6: Adjacent <ins> with mixed status ===');
const html6 = '<p>text<ins data-status="accepted" data-suggestion-id="a1">keep</ins><ins data-status="pending" data-suggestion-id="p1">drop</ins>end</p>';
const root6 = document.createElement('div');
root6.innerHTML = html6;
const nodes6 = Array.from(root6.querySelectorAll('ins[data-suggestion-id]'));
for (const el of nodes6) {
  if (!el.parentNode) continue;
  const status = el.getAttribute('data-status') ?? 'pending';
  if (status === 'pending') {
    el.parentNode.removeChild(el);
  } else {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.parentNode.removeChild(el);
  }
}
console.log('Result:', root6.innerHTML);
