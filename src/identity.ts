import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Identity {
  privateKey: Uint8Array;
  publicKey: string;
  npub: string;
  agentId: string;
}

const CLAWMESH_DIR = path.join(os.homedir(), '.clawmesh');
const IDENTITY_FILE = path.join(CLAWMESH_DIR, 'identity.json');

const AGENT_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;

export function isValidAgentId(agentId: string): boolean {
  return AGENT_ID_REGEX.test(agentId) && agentId.length <= 64;
}

export function getClawmeshDir(): string {
  return CLAWMESH_DIR;
}

export function ensureDir(): void {
  if (!fs.existsSync(CLAWMESH_DIR)) {
    fs.mkdirSync(CLAWMESH_DIR, { mode: 0o700 });
  }
}

export function identityExists(): boolean {
  return fs.existsSync(IDENTITY_FILE);
}

export function generateIdentity(agentId: string): Identity {
  const privateKey = generateSecretKey();
  const publicKey = getPublicKey(privateKey);
  const npub = nip19.npubEncode(publicKey);

  return { privateKey, publicKey, npub, agentId };
}

export function saveIdentity(identity: Identity): void {
  ensureDir();
  const data = {
    privateKey: Buffer.from(identity.privateKey).toString('hex'),
    publicKey: identity.publicKey,
    npub: identity.npub,
    agentId: identity.agentId,
    createdAt: Date.now()
  };
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function loadIdentity(): Identity | null {
  if (!identityExists()) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf-8'));
    if (!data.privateKey || !data.publicKey || !data.agentId) {
      return null;
    }
    return {
      privateKey: Uint8Array.from(Buffer.from(data.privateKey, 'hex')),
      publicKey: data.publicKey,
      npub: data.npub,
      agentId: data.agentId
    };
  } catch {
    return null;
  }
}

export function requireIdentity(): Identity {
  const identity = loadIdentity();
  if (!identity) {
    console.error('Not initialized. Run: clawmesh init <agent_id>');
    process.exit(1);
  }
  return identity;
}
