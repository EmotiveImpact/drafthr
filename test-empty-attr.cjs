const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Test: does getAttribute work with empty string attributes?
const html = '<p><ins data-suggestion=""></ins></p>';
const root = document.createElement('div');
root.innerHTML = html;
const ins = root.querySelector('ins');
console.log('HTML:', html);
console.log('getAttribute("data-suggestion"):', ins.getAttribute('data-suggestion'));
console.log('getAttribute("data-suggestion") === "":', ins.getAttribute('data-suggestion') === '');
console.log('getAttribute("data-suggestion") ?? "default":', ins.getAttribute('data-suggestion') ?? 'default');
