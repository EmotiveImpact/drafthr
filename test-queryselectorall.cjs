const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Test: does forEach on querySelectorAll give a live or static list?
const root = document.createElement('div');
root.innerHTML = '<del id="d1">1</del><del id="d2">2</del><del id="d3">3</del>';

console.log('Original HTML:', root.innerHTML);
console.log('Total <del> elements:', root.querySelectorAll('del').length);

// Iterate and remove
root.querySelectorAll('del').forEach((el, idx) => {
  console.log(`Processing element ${idx}: id=${el.getAttribute('id')}, parentNode=${el.parentNode ? 'exists' : 'null'}`);
  if (el.parentNode) {
    el.remove();
  }
});

console.log('Final HTML:', root.innerHTML);
