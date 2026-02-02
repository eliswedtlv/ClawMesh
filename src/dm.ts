import { finalizeEvent, nip44, type Event } from 'nostr-tools';
import * as crypto from 'crypto';
import { type RelayPool, publishToRelays, queryRelays } from './relay.js';
import { type Identity } from './identity.js';
import { saveInboxMessage } from './store.js';

const KIND_GIFT_WRAP = 1059;
const KIND_SEAL = 13;
const KIND_RUMOR = 14;

export interface ClawmeshMessage {
  v: 1;
  type: 'direct' | 'ack';
  from_agent: string;
  to_agent?: string;
  payload: { text: string; [key: string]: unknown };
  nonce: string;
  ts: number;
}

export async function sendDM(
  pool: RelayPool,
  identity: Identity,
  recipientPubkey: string,
  recipientAgentId: string,
  message: string
): Promise<{ success: boolean; messageId: string; relays: string[] }> {
  const nonce = crypto.randomUUID();

  const clawmeshMessage: ClawmeshMessage = {
    v: 1,
    type: 'direct',
    from_agent: identity.agentId,
    to_agent: recipientAgentId,
    payload: { text: message },
    nonce,
    ts: Date.now()
  };

  // Create the rumor (unsigned inner event)
  const rumor = {
    kind: KIND_RUMOR,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkey]],
    content: JSON.stringify(clawmeshMessage),
    pubkey: identity.publicKey
  };

  // Create conversation key for NIP-44 encryption
  const conversationKey = nip44.getConversationKey(identity.privateKey, recipientPubkey);

  // Seal the rumor (encrypt to recipient)
  const sealContent = nip44.encrypt(JSON.stringify(rumor), conversationKey);
  const seal = finalizeEvent({
    kind: KIND_SEAL,
    created_at: randomTimeOffset(),
    tags: [],
    content: sealContent
  }, identity.privateKey);

  // Create ephemeral key for gift wrap
  const wrapPrivkey = crypto.getRandomValues(new Uint8Array(32));
  const wrapConversationKey = nip44.getConversationKey(wrapPrivkey, recipientPubkey);

  // Gift wrap the seal
  const wrapContent = nip44.encrypt(JSON.stringify(seal), wrapConversationKey);
  const wrap = finalizeEvent({
    kind: KIND_GIFT_WRAP,
    created_at: randomTimeOffset(),
    tags: [['p', recipientPubkey]],
    content: wrapContent
  }, wrapPrivkey);

  const result = await publishToRelays(pool, wrap);

  return {
    success: result.success.length > 0,
    messageId: nonce,
    relays: result.success
  };
}

export async function fetchDMs(
  pool: RelayPool,
  identity: Identity,
  since?: number
): Promise<ClawmeshMessage[]> {
  const filter: { kinds: number[]; '#p': string[]; since?: number } = {
    kinds: [KIND_GIFT_WRAP],
    '#p': [identity.publicKey]
  };
  if (since) {
    filter.since = since;
  }

  const events = await queryRelays(pool, filter, 10000);
  const messages: ClawmeshMessage[] = [];

  for (const event of events) {
    try {
      const msg = unwrapMessage(event, identity);
      if (msg) {
        messages.push(msg);

        // Save to inbox
        saveInboxMessage({
          id: msg.nonce,
          fromPubkey: event.pubkey,
          fromAgentId: msg.from_agent,
          content: msg.payload.text,
          timestamp: msg.ts
        });
      }
    } catch {
      // Skip malformed messages
      continue;
    }
  }

  return messages.sort((a, b) => a.ts - b.ts);
}

function unwrapMessage(wrapEvent: Event, identity: Identity): ClawmeshMessage | null {
  try {
    // Decrypt the gift wrap using our private key
    // First, get the wrapper's pubkey from the event
    const wrapConversationKey = nip44.getConversationKey(identity.privateKey, wrapEvent.pubkey);
    const sealJson = nip44.decrypt(wrapEvent.content, wrapConversationKey);
    const seal = JSON.parse(sealJson);

    // Decrypt the seal
    const sealConversationKey = nip44.getConversationKey(identity.privateKey, seal.pubkey);
    const rumorJson = nip44.decrypt(seal.content, sealConversationKey);
    const rumor = JSON.parse(rumorJson);

    // Parse the Clawmesh message
    const msg = JSON.parse(rumor.content) as ClawmeshMessage;

    // Validate protocol version and required fields
    if (msg.v !== 1 || !msg.type || !msg.nonce || typeof msg.ts !== 'number') {
      return null;
    }

    return msg;
  } catch {
    return null;
  }
}

function randomTimeOffset(): number {
  // Random time within the last 2 days for metadata privacy
  const twoDays = 2 * 24 * 60 * 60;
  const offset = Math.floor(Math.random() * twoDays);
  return Math.floor(Date.now() / 1000) - offset;
}
