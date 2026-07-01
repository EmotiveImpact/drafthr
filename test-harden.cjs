const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

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
      anchor.removeAttribute("href");
    }

    const blankCount = href ? blankLinkHrefs.get(href) ?? 0 : 0;
    if (blankCount > 0) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      blankLinkHrefs.set(href, blankCount - 1);
      return;
    }

    const target = anchor.getAttribute("target");
    if (target === "_blank") {
      anchor.setAttribute("rel", "noopener noreferrer");
    } else if (target && target !== "_self") {
      anchor.removeAttribute("target");
    }
  });
  return root.innerHTML;
}

// Edge case: Link that had target="_blank" stripped by DOMPurify, but href survived
// Then collectBlankLinkHrefs doesn't find it, so blankCount=0
// But the link itself is still there with the href
console.log('=== Test: Link stripped of target by sanitizer ===');
const html1 = '<a href="https://example.com">safe link</a>';
const blankHrefs1 = collectBlankLinkHrefs(html1);
console.log('Blank link hrefs collected:', blankHrefs1);
const result1 = hardenSanitizedHtml(html1, blankHrefs1);
console.log('Input:', html1);
console.log('Result:', result1);
console.log('Note: no target="_blank" set because collectBlankLinkHrefs saw no target attr originally');

// Edge case: What if the href itself is empty string?
console.log('\n=== Test: Empty href attribute ===');
const html2 = '<a href="">click me</a>';
const blankHrefs2 = collectBlankLinkHrefs(html2);
const result2 = hardenSanitizedHtml(html2, blankHrefs2);
console.log('Input:', html2);
console.log('Result:', result2);

// Edge case: href with only whitespace
console.log('\n=== Test: Whitespace-only href ===');
const html3 = '<a href="   ">click me</a>';
const blankHrefs3 = collectBlankLinkHrefs(html3);
const result3 = hardenSanitizedHtml(html3, blankHrefs3);
console.log('Input:', html3);
console.log('Result:', result3);
