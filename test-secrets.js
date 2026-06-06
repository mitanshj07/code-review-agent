import { scanForSecrets } from './src/secretScanner.js';

const fakeAwsKey = 'AKIA' + 'IOSFODNN7EXAMPLE';
const fakeGitHubToken = 'ghp_' + '1234567890abcdefghij1234567890abcdef';

const testDiff = `
diff --git a/test-secrets-live.js b/test-secrets-live.js
--- a/test-secrets-live.js
+++ b/test-secrets-live.js
@@ -0,0 +1,3 @@
+const apiKey = '${fakeAwsKey}'
+const password = 'supersecret123'
+const token = '${fakeGitHubToken}'
`;

const results = scanForSecrets(testDiff);
console.log('Secrets found:', results.length);
console.log(JSON.stringify(results, null, 2));
if (results.length < 2) {
  process.exit(1);
}
console.log('SECRET SCANNER TEST PASSED');
