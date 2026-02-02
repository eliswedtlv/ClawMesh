import { finalizeEvent, type Event } from 'nostr-tools';
import { type RelayPool, publishToRelays, queryRelays } from './relay.js';
import { type Identity } from './identity.js';
import { saveGroup, getGroups } from './store.js';

const KIND_CHANNEL_CREATE = 40;
const KIND_CHANNEL_MESSAGE = 42;

export interface GroupMessage {
  id: string;
  groupId: string;
  pubkey: string;
  agentId?: string;
  content: string;
  timestamp: number;
}

export async function createGroup(
  pool: RelayPool,
  identity: Identity,
  groupId: string,
  name: string,
  about?: string
): Promise<{ success: boolean; eventId?: string }> {
  const metadata = {
    name,
    about: about || `ClawMesh group: ${groupId}`,
    picture: ''
  };

  const event = finalizeEvent({
    kind: KIND_CHANNEL_CREATE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', groupId]],
    content: JSON.stringify(metadata)
  }, identity.privateKey);

  const result = await publishToRelays(pool, event);

  if (result.success.length > 0) {
    saveGroup(groupId, false);
    return { success: true, eventId: event.id };
  }

  return { success: false };
}

export async function publishToGroup(
  pool: RelayPool,
  identity: Identity,
  groupId: string,
  message: string
): Promise<{ success: boolean; eventId?: string }> {
  // Find the channel creation event to get the root event ID
  const channelEvents = await queryRelays(pool, {
    kinds: [KIND_CHANNEL_CREATE],
    '#d': [groupId]
  });

  let rootEventId: string;
  if (channelEvents.length > 0) {
    rootEventId = channelEvents[0].id;
  } else {
    // Create the channel if it doesn't exist
    const created = await createGroup(pool, identity, groupId, groupId);
    if (!created.eventId) {
      return { success: false };
    }
    rootEventId = created.eventId;
  }

  const content = JSON.stringify({
    v: 1,
    type: 'group',
    from_agent: identity.agentId,
    payload: { text: message },
    ts: Date.now()
  });

  const event = finalizeEvent({
    kind: KIND_CHANNEL_MESSAGE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['e', rootEventId, '', 'root']],
    content
  }, identity.privateKey);

  const result = await publishToRelays(pool, event);

  return {
    success: result.success.length > 0,
    eventId: event.id
  };
}

export async function subscribeToGroup(groupId: string): Promise<void> {
  saveGroup(groupId, false);
}

export async function fetchGroupMessages(
  pool: RelayPool,
  groupId: string,
  limit: number = 50
): Promise<GroupMessage[]> {
  // First find the channel
  const channelEvents = await queryRelays(pool, {
    kinds: [KIND_CHANNEL_CREATE],
    '#d': [groupId]
  });

  if (channelEvents.length === 0) {
    return [];
  }

  const rootEventId = channelEvents[0].id;

  // Fetch messages for this channel
  const messageEvents = await queryRelays(pool, {
    kinds: [KIND_CHANNEL_MESSAGE],
    '#e': [rootEventId],
    limit
  });

  return messageEvents.map(event => {
    let agentId: string | undefined;
    let text = event.content;

    try {
      const parsed = JSON.parse(event.content);
      agentId = parsed.from_agent;
      text = parsed.payload?.text || event.content;
    } catch {
      // Plain text message
    }

    return {
      id: event.id,
      groupId,
      pubkey: event.pubkey,
      agentId,
      content: text,
      timestamp: event.created_at * 1000
    };
  }).sort((a, b) => a.timestamp - b.timestamp);
}

export function listSubscribedGroups(): { groupId: string; isPrivate: boolean }[] {
  return getGroups().map(g => ({
    groupId: g.group_id,
    isPrivate: g.is_private === 1
  }));
}
