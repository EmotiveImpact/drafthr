const isSafeLink = (href) => /^(?:https?:|mailto:|tel:|\/|#)/i.test(href.trim());

// Test various href values
const testCases = [
  'https://example.com',
  'http://example.com',
  'mailto:test@example.com',
  'tel:+1234567890',
  '/internal/path',
  '#anchor',
  '  /path-with-leading-space',
  'javascript:alert(1)',
  '//evil.com',
  'data:text/html,payload',
  '',
  ' ',
  'relative/path',
  '../parent/path',
];

console.log('Testing isSafeLink regex:');
for (const href of testCases) {
  const safe = isSafeLink(href);
  const display = href.length <= 30 ? href : href.substring(0, 27) + '...';
  console.log(`  "${display}": ${safe ? 'SAFE' : 'BLOCKED'}`);
}
