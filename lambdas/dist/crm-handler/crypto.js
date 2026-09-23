'use strict';
// KMS-backed credential encryption + masking for the CRM handler.

const { KMSClient, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');

const kms = new KMSClient({});
const KEY_ID = process.env.CRM_KMS_KEY_ID;

// Encrypt a credential string with the CRM KMS CMK; returns base64 ciphertext.
async function encryptCredential(plaintext) {
  const out = await kms.send(new EncryptCommand({
    KeyId: KEY_ID,
    Plaintext: Buffer.from(plaintext, 'utf8'),
  }));
  return Buffer.from(out.CiphertextBlob).toString('base64');
}

// Decrypt a base64 ciphertext back to the credential string.
async function decryptCredential(ciphertextB64) {
  const out = await kms.send(new DecryptCommand({
    KeyId: KEY_ID,
    CiphertextBlob: Buffer.from(ciphertextB64, 'base64'),
  }));
  return Buffer.from(out.Plaintext).toString('utf8');
}

function maskCredential() {
  return '••••••';
}

// Strip ciphertext from a stored connection item for any read/response.
function sanitizeConnectionForRead(item) {
  const { credentialCiphertext, PK, SK, ...rest } = item;
  const hadCredential = credentialCiphertext != null && credentialCiphertext !== '';
  return { ...rest, credentialMasked: hadCredential ? maskCredential() : '' };
}

module.exports = { encryptCredential, decryptCredential, maskCredential, sanitizeConnectionForRead };
