import * as fs from 'fs';
import * as path from 'path';
import { getClawmeshDir, ensureDir } from './identity.js';

interface Store {
  inbox: InboxMessage[];
  outbox: OutboxMessage[];
  peers: PeerRow[];
  groups: GroupRow[];
}

let store: Store | null = null;
const STORE_FILE = () => path.join(getClawmeshDir(), 'store.json');

function loadStore(): Store {
  if (store) return store;

  ensureDir();
  const file = STORE_FILE();

  if (fs.existsSync(file)) {
    try {
      store = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      store = { inbox: [], outbox: [], peers: [], groups: [] };
    }
  } else {
    store = { inbox: [], outbox: [], peers: [], groups: [] };
  }

  return store!;
}

function saveStore(): void {
  if (!store) return;
  ensureDir();
  fs.writeFileSync(STORE_FILE(), JSON.stringify(store, null, 2), { mode: 0o600 });
}

export interface InboxMessage {
  id: string;
  from_pubkey: string;
  from_agent_id: string | null;
  content: string;
  timestamp: number;
  read: number;
  created_at: number;
}

export interface OutboxMessage {
  id: string;
  to_pubkey: string;
  to_agent_id: string | null;
  content: string;
  nonce: string;
  status: string;
  attempts: number;
  created_at: number;
}

export interface PeerRow {
  pubkey: string;
  agent_id: string | null;
  last_seen: number | null;
  capabilities: string | null;
  relays: string | null;
}

export interface GroupRow {
  group_id: string;
  is_private: number;
  subscribed_at: number;
}

export function saveInboxMessage(msg: {
  id: string;
  fromPubkey: string;
  fromAgentId?: string;
  content: string;
  timestamp: number;
}): void {
  const s = loadStore();

  // Check for duplicate
  if (s.inbox.some(m => m.id === msg.id)) {
    return;
  }

  s.inbox.push({
    id: msg.id,
    from_pubkey: msg.fromPubkey,
    from_agent_id: msg.fromAgentId || null,
    content: msg.content,
    timestamp: msg.timestamp,
    read: 0,
    created_at: Date.now()
  });

  saveStore();
}

export function getInboxMessages(opts: {
  unreadOnly?: boolean;
  limit?: number;
  fromAgent?: string;
}): InboxMessage[] {
  const s = loadStore();
  let messages = [...s.inbox];

  if (opts.unreadOnly) {
    messages = messages.filter(m => m.read === 0);
  }
  if (opts.fromAgent) {
    messages = messages.filter(m => m.from_agent_id === opts.fromAgent);
  }

  messages.sort((a, b) => b.timestamp - a.timestamp);

  if (opts.limit) {
    messages = messages.slice(0, opts.limit);
  }

  return messages;
}

export function markAsRead(id: string): void {
  const s = loadStore();
  const msg = s.inbox.find(m => m.id === id);
  if (msg) {
    msg.read = 1;
    saveStore();
  }
}

export function getUnreadCount(): number {
  const s = loadStore();
  return s.inbox.filter(m => m.read === 0).length;
}

export function savePeer(peer: {
  pubkey: string;
  agentId?: string;
  capabilities?: string[];
  relays?: string[];
}): void {
  const s = loadStore();

  const existing = s.peers.findIndex(p => p.pubkey === peer.pubkey);
  const row: PeerRow = {
    pubkey: peer.pubkey,
    agent_id: peer.agentId || null,
    last_seen: Math.floor(Date.now() / 1000),
    capabilities: peer.capabilities ? JSON.stringify(peer.capabilities) : null,
    relays: peer.relays ? JSON.stringify(peer.relays) : null
  };

  if (existing >= 0) {
    s.peers[existing] = row;
  } else {
    s.peers.push(row);
  }

  saveStore();
}

export function getPeers(): PeerRow[] {
  const s = loadStore();
  return [...s.peers].sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0));
}

export function getPeerByAgentId(agentId: string): PeerRow | null {
  const s = loadStore();
  return s.peers.find(p => p.agent_id === agentId) || null;
}

export function saveGroup(groupId: string, isPrivate: boolean = false): void {
  const s = loadStore();

  if (s.groups.some(g => g.group_id === groupId)) {
    return;
  }

  s.groups.push({
    group_id: groupId,
    is_private: isPrivate ? 1 : 0,
    subscribed_at: Date.now()
  });

  saveStore();
}

export function getGroups(): GroupRow[] {
  const s = loadStore();
  return s.groups;
}

export function closeDb(): void {
  // No-op for JSON store
}
