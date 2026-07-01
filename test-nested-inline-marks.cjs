const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Simulate mergeAcceptedSuggestionsHtml with nested inline marks
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

// CRITICAL edge case: <ins> inside <strong> inside paragraph
console.log('=== Test: <ins> inside <strong> (nested inline mark) ===');
const html1 = '<p><strong><ins data-suggestion-id="i1" data-suggestion-kind="insertion" data-status="accepted">bold new</ins></strong></p>';
console.log('Input:', html1);
const root1 = document.createElement('div');
root1.innerHTML = html1;
applyMergeToDom(root1);
console.log('Result:', root1.innerHTML);
console.log('Expected: <p><strong>bold new</strong></p>');

// CRITICAL edge case: <strong> inside <ins>
console.log('\n=== Test: <strong> inside <ins> (nested inline mark reversed) ===');
const html2 = '<p><ins data-suggestion-id="i2" data-suggestion-kind="insertion" data-status="accepted"><strong>bold new</strong></ins></p>';
console.log('Input:', html2);
const root2 = document.createElement('div');
root2.innerHTML = html2;
applyMergeToDom(root2);
console.log('Result:', root2.innerHTML);
console.log('Expected: <p><strong>bold new</strong></p>');

// CRITICAL edge case: Multiple nested marks: <strong><em><ins>text</ins></em></strong>
console.log('\n=== Test: Triple-nested marks ===');
const html3 = '<p><strong><em><ins data-suggestion-id="i3" data-suggestion-kind="insertion" data-status="accepted">text</ins></em></strong></p>';
console.log('Input:', html3);
const root3 = document.createElement('div');
root3.innerHTML = html3;
applyMergeToDom(root3);
console.log('Result:', root3.innerHTML);
console.log('Expected: <p><strong><em>text</em></strong></p>');

// CRITICAL edge case: <ins> with attribute that might confuse parsing
console.log('\n=== Test: <ins> with style attribute containing > character ===');
const html4 = '<p><ins data-suggestion-id="i4" data-suggestion-kind="insertion" data-status="accepted" style="width: 100px;">content</ins></p>';
console.log('Input:', html4);
const root4 = document.createElement('div');
root4.innerHTML = html4;
applyMergeToDom(root4);
console.log('Result:', root4.innerHTML);

// CRITICAL edge case: <del> with child elements that have their own marks
console.log('\n=== Test: <del> with child <strong> that should survive ===');
const html5 = '<p>keep <del data-suggestion-id="d1" data-suggestion-kind="deletion" data-status="pending"><strong>bold original</strong> text</del> end</p>';
console.log('Input:', html5);
const root5 = document.createElement('div');
root5.innerHTML = html5;
applyMergeToDom(root5);
console.log('Result:', root5.innerHTML);
console.log('Expected: keep <strong>bold original</strong> text end');
