const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Replicate applyMergeToDom logic
function applyMergeToDom(root, forExport = false) {
  const nodes = Array.from(root.querySelectorAll('ins[data-suggestion-id], del[data-suggestion-id]'));
  for (const el of nodes) {
    if (!el.parentNode) continue;
    const tag = el.tagName.toLowerCase();
    const kindAttr = el.getAttribute("data-suggestion-kind");
    const kind = (kindAttr === "deletion" || kindAttr === "insertion")
      ? kindAttr
      : tag === "del" ? "deletion" : "insertion";
    const status = el.getAttribute("data-status") ?? "pending";
    
    if (status === "rejected") {
      if (!forExport) continue;
      if (kind === "insertion") {
        el.parentNode.removeChild(el);
      } else {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.parentNode.removeChild(el);
      }
      continue;
    }
    
    if (kind === "deletion" && status === "accepted") {
      el.parentNode.removeChild(el);
      continue;
    }
    
    if (kind === "insertion" && status === "pending") {
      el.parentNode.removeChild(el);
      continue;
    }
    
    // Unwrap: accepted insertion OR pending deletion
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.parentNode.removeChild(el);
  }
}

// Edge case: <del> at the start of an element with no preceding text
console.log('=== Test: <del> at element start ===');
const html1 = '<p><del data-suggestion-id="d1" data-suggestion-kind="deletion" data-status="accepted">removed</del>kept</p>';
const root1 = document.createElement('div');
root1.innerHTML = html1;
console.log('Input:', root1.innerHTML);
applyMergeToDom(root1, false);
console.log('Result:', root1.innerHTML);

// Edge case: <ins> with attributes (inline styles, classes)
console.log('\n=== Test: <ins> with attributes on children ===');
const html2 = '<p>text <ins data-suggestion-id="i1" data-suggestion-kind="insertion" data-status="accepted" class="foo" style="color:red"><strong>bold new</strong> and <em>italic</em></ins> end</p>';
const root2 = document.createElement('div');
root2.innerHTML = html2;
console.log('Input:', root2.innerHTML);
applyMergeToDom(root2, false);
console.log('Result:', root2.innerHTML);
console.log('Note: <strong> and <em> are now unwrapped from <ins>, keeping their markup');

// Edge case: Pending deletion wrapping only whitespace
console.log('\n=== Test: Pending deletion with only whitespace ===');
const html3 = '<p>text<del data-suggestion-id="d2" data-suggestion-kind="deletion" data-status="pending">   </del>next</p>';
const root3 = document.createElement('div');
root3.innerHTML = html3;
console.log('Input:', root3.innerHTML);
applyMergeToDom(root3, false);
console.log('Result:', root3.innerHTML);

// CRITICAL edge case: What if applyMergeToDom is called on HTML where 
// <ins>/<del> are MISSING the data-suggestion-kind attribute?
// The code should infer from the tag name
console.log('\n=== Test: Infer kind from tag when data-suggestion-kind missing ===');
const html4 = '<p>a <del data-suggestion-id="d3" data-status="accepted">deleted</del> b</p>';
const root4 = document.createElement('div');
root4.innerHTML = html4;
console.log('Input (no data-suggestion-kind):', root4.innerHTML);
applyMergeToDom(root4, false);
console.log('Result:', root4.innerHTML);
console.log('Expected: deleted text should be REMOVED (del + accepted = remove)');
