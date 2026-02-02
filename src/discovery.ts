import { finalizeEvent, type Event } from 'nostr-tools';
import { type RelayPool, publishToRelays, queryRelays } from './relay.js';
import { type Identity } from './identity.js';
import { savePeer } from './store.js';

const KIND_MAPPING = 30078;

export interface DiscoveredAgent {
  agentId: string;
  pubkey: string;
  capabilities: string[];
  relays: string[];
  registeredAt: number;
}

export async function register(
  pool: RelayPool,
  identity: Identity,
  capabilities: string[] = []
): Promise<{ success: string[]; failed: string[] }> {
  const content = JSON.stringify({
    v: 1,
    agent_id: identity.agentId,
    capabilities
  });

  const relayTags = pool.connected.map(url => ['relay', url]);

  const event = finalizeEvent({
    kind: KIND_MAPPING,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', identity.agentId],
      ...relayTags
    ],
    content
  }, identity.privateKey);

  return publishToRelays(pool, event);
}

export async function discoverAgent(
  pool: RelayPool,
  agentId: string
): Promise<DiscoveredAgent | null> {
  const events = await queryRelays(pool, {
    kinds: [KIND_MAPPING],
    '#d': [agentId]
  });

  if (events.length === 0) {
    return null;
  }

  // Get the most recent event
  const event = events.sort((a, b) => b.created_at - a.created_at)[0];
  return parseAgentEvent(event);
}

export async function discoverAll(
  pool: RelayPool,
  opts?: { prefix?: string; limit?: number }
): Promise<{ agents: DiscoveredAgent[]; total: number }> {
  const events = await queryRelays(pool, {
    kinds: [KIND_MAPPING]
  }, 10000); // longer timeout for full scan

  // Dedupe by agent_id, keeping most recent
  const agentMap = new Map<string, Event>();
  for (const event of events) {
    try {
      const content = JSON.parse(event.content);
      const agentId = content.agent_id;
      if (!agentId) continue;

      const existing = agentMap.get(agentId);
      if (!existing || event.created_at > existing.created_at) {
        agentMap.set(agentId, event);
      }
    } catch {
      continue;
    }
  }

  let agents = Array.from(agentMap.values())
    .map(parseAgentEvent)
    .filter((a): a is DiscoveredAgent => a !== null);

  const total = agents.length;

  // Apply prefix filter
  if (opts?.prefix) {
    agents = agents.filter(a => a.agentId.startsWith(opts.prefix!));
  }

  // Apply limit
  if (opts?.limit && opts.limit > 0) {
    agents = agents.slice(0, opts.limit);
  }

  // Save to peers table
  for (const agent of agents) {
    savePeer({
      pubkey: agent.pubkey,
      agentId: agent.agentId,
      capabilities: agent.capabilities,
      relays: agent.relays
    });
  }

  return { agents, total };
}

function parseAgentEvent(event: Event): DiscoveredAgent | null {
  try {
    const content = JSON.parse(event.content);
    const relays = event.tags
      .filter(t => t[0] === 'relay')
      .map(t => t[1]);

    return {
      agentId: content.agent_id,
      pubkey: event.pubkey,
      capabilities: content.capabilities || [],
      relays,
      registeredAt: event.created_at
    };
  } catch {
    return null;
  }
}
