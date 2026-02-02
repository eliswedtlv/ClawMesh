import { Relay, finalizeEvent, type Event, type Filter } from 'nostr-tools';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band'
];

export interface RelayPool {
  relays: Relay[];
  connected: string[];
  failed: string[];
}

export function getRelayUrls(): string[] {
  const relaysFile = path.join(process.cwd(), 'relays.json');
  if (fs.existsSync(relaysFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(relaysFile, 'utf-8'));
      return data.relays || DEFAULT_RELAYS;
    } catch {
      return DEFAULT_RELAYS;
    }
  }
  return DEFAULT_RELAYS;
}

export async function connectToRelays(urls?: string[]): Promise<RelayPool> {
  const relayUrls = urls || getRelayUrls();
  const pool: RelayPool = { relays: [], connected: [], failed: [] };

  const connections = relayUrls.map(async (url) => {
    try {
      const relay = await Relay.connect(url);
      pool.relays.push(relay);
      pool.connected.push(url);
      return relay;
    } catch (err) {
      pool.failed.push(url);
      return null;
    }
  });

  await Promise.allSettled(connections);
  return pool;
}

export async function publishToRelays(pool: RelayPool, event: Event): Promise<{ success: string[]; failed: string[] }> {
  const results = { success: [] as string[], failed: [] as string[] };

  const publishes = pool.relays.map(async (relay) => {
    try {
      await relay.publish(event);
      results.success.push(relay.url);
    } catch {
      results.failed.push(relay.url);
    }
  });

  await Promise.allSettled(publishes);
  return results;
}

export async function queryRelays(
  pool: RelayPool,
  filter: Filter,
  timeout: number = 5000
): Promise<Event[]> {
  const events: Map<string, Event> = new Map();

  const queries = pool.relays.map((relay) => {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        sub.close();
        resolve();
      }, timeout);

      const sub = relay.subscribe([filter], {
        onevent(event) {
          events.set(event.id, event);
        },
        oneose() {
          clearTimeout(timer);
          sub.close();
          resolve();
        }
      });
    });
  });

  await Promise.allSettled(queries);
  return Array.from(events.values());
}

export async function subscribeToRelays(
  pool: RelayPool,
  filter: Filter,
  onEvent: (event: Event) => void
): Promise<() => void> {
  const subs = pool.relays.map((relay) => {
    return relay.subscribe([filter], {
      onevent: onEvent
    });
  });

  return () => {
    subs.forEach(sub => sub.close());
  };
}

export function closeRelays(pool: RelayPool): void {
  pool.relays.forEach(relay => {
    try {
      relay.close();
    } catch {
      // ignore
    }
  });
}
