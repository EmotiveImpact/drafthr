const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
const purify = DOMPurify(window);

function isSafeLinkHref(href) {
  const value = href.trim();
  return /^(?:https?:|mailto:|tel:|#)/i.test(value) || (value.startsWith("/") && !value.startsWith("//"));
}

function collectBlankLinkHrefs(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  const counts = new Map();
  root.querySelectorAll("a[target]").forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    const target = anchor.getAttribute("target")?.trim().toLowerCase();
    if (target === "_blank" && href && isSafeLinkHref(href)) {
      counts.set(href, (counts.get(href) ?? 0) + 1);
    }
  });
  return counts;
}

function hardenSanitizedHtml(html, blankLinkHrefs) {
  const root = document.createElement("div");
  root.innerHTML = html;
  root.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (href && !isSafeLinkHref(href)) {
      console.log(`    hardenSanitizedHtml removing unsafe href: "${href}"`);
      anchor.removeAttribute("href");
    }
    // ... rest of logic
  });
  return root.innerHTML;
}

// Register the BUGGY hook
purify.addHook("uponSanitizeAttribute", (node, data) => {
  const nodeName = node.nodeName.toUpperCase();
  const attrName = data.attrName.toLowerCase();
  if (nodeName === "A" && attrName === "href" && data.attrValue) {
    const href = String(data.attrValue).trim();
    const isSafeLink = /^(?:https?:|mailto:|tel:|\/|#)/i.test(href);
    data.keepAttr = isSafeLink;
  }
  if (nodeName === "A" && attrName === "target" && data.attrValue) {
    const target = String(data.attrValue).trim().toLowerCase();
    data.keepAttr = target === "_blank" || target === "_self";
  }
});

const html = '<a href="//evil.example/path">click</a>';
console.log('=== Full sanitization pipeline ===');
console.log('Input:', html);

console.log('\nStep 1: DOMPurify.sanitize()');
const cleaned = purify.sanitize(html, {
  ALLOWED_TAGS: ['a'],
  ALLOWED_ATTR: ['href'],
  KEEP_CONTENT: true,
});
console.log('  Result:', cleaned);

console.log('\nStep 2: hardenSanitizedHtml()');
const blankHrefs = collectBlankLinkHrefs(cleaned);
const final = hardenSanitizedHtml(cleaned, blankHrefs);
console.log('  Result:', final);

console.log('\nFinal check:');
if (final.includes('href=')) {
  console.log('BUG CONFIRMED: unsafe href still present in output!');
} else {
  console.log('OK: unsafe href was removed');
}
