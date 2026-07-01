const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
const purify = DOMPurify(window);

// Test: What happens with empty href attribute?
// The hook has: if (nodeName === "A" && attrName === "href" && data.attrValue)
// This means empty href is NOT processed by the hook

let hookCalledForEmptyHref = false;
purify.addHook("uponSanitizeAttribute", (node, data) => {
  if (node.nodeName === "A" && data.attrName === "href") {
    console.log(`Hook called for href with value: "${data.attrValue}"`);
    if (data.attrValue) {
      hookCalledForEmptyHref = true;
    }
  }
});

const html1 = '<a href="">empty</a>';
const result1 = purify.sanitize(html1, {
  ALLOWED_TAGS: ['a'],
  ALLOWED_ATTR: ['href'],
});
console.log('Input:', html1);
console.log('Hook processed empty href:', hookCalledForEmptyHref ? 'YES' : 'NO');
console.log('Result:', result1);

// Test with zero-width space
console.log('\n=== Test: Zero-width space href ===');
const html2 = '<a href="​">zero-width</a>';
const result2 = purify.sanitize(html2, {
  ALLOWED_TAGS: ['a'],
  ALLOWED_ATTR: ['href'],
});
console.log('Result:', result2);
