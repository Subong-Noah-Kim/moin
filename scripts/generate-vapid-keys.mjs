// One-time VAPID key generation. stdout: JWK key pair JSON for the
// VAPID_KEYS_JWK Supabase secret. stderr: the public application server key
// to commit in push-config.js. The private key must never enter the repo.
const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
const applicationServerKey = Buffer.from(rawPublicKey).toString('base64url');

console.log(JSON.stringify({ publicKey, privateKey }));
console.error(`application server key (push-config.js): ${applicationServerKey}`);
