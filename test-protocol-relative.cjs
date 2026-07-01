const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
const purify = DOMPurify(window);

// Register the hook from sanitize.ts
purify.addHook("uponSanitizeAttribute", (node, data) => {
  const nodeName = node.nodeName.toUpperCase();
  const attrName = data.attrName.toLowerCase();
  if (nodeName === "A" && attrName === "href" && data.attrValue) {
    const href = String(data.attrValue).trim();
    // This is the BUGGY regex from line 28
    const isSafeLink = /^(?:https?:|mailto:|tel:|\/|#)/i.test(href);
    console.log(`  Hook check for "${href}": ${isSafeLink ? 'KEEP' : 'REMOVE'}`);
    data.keepAttr = isSafeLink;
  }
  if (nodeName === "A" && attrName === "target" && data.attrValue) {
    const target = String(data.attrValue).trim().toLowerCase();
    data.keepAttr = target === "_blank" || target === "_self";
  }
});

const html = '<a href="//evil.example/path">x</a>';
console.log('Testing protocol-relative link with DOMPurify hook:');
console.log('Input:', html);
const result = purify.sanitize(html, {
  ALLOWED_TAGS: ['a'],
  ALLOWED_ATTR: ['href'],
  KEEP_CONTENT: true,
});
console.log('Result:', result);
console.log('BUG: href attribute SURVIVED the hook, even though it shouldn\'t!');
