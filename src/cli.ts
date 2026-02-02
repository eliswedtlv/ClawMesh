#!/usr/bin/env node

import { Command } from 'commander';
import {
  generateIdentity,
  saveIdentity,
  loadIdentity,
  requireIdentity,
  identityExists,
  isValidAgentId
} from './identity.js';
import { connectToRelays, closeRelays } from './relay.js';
import { register, discoverAgent, discoverAll } from './discovery.js';
import { sendDM, fetchDMs } from './dm.js';
import { publishToGroup, subscribeToGroup, fetchGroupMessages, listSubscribedGroups } from './groups.js';
import { getInboxMessages, getPeers, getUnreadCount, closeDb } from './store.js';
import { VERSION } from './index.js';

const program = new Command();

program
  .name('clawmesh')
  .description('Agent-to-agent communication for OpenClaw via Nostr')
  .version(VERSION);

// init
program
  .command('init <agent_id>')
  .description('Initialize identity with a new keypair')
  .action((agentId: string) => {
    if (!isValidAgentId(agentId)) {
      console.error('Invalid agent ID. Use alphanumeric characters, dots, dashes, underscores (max 64 chars).');
      process.exit(1);
    }

    if (identityExists()) {
      console.error('Already initialized. Delete ~/.clawmesh/identity.json to reinitialize.');
      process.exit(1);
    }

    const identity = generateIdentity(agentId);
    saveIdentity(identity);

    console.log('Initialized ClawMesh identity');
    console.log(`  Agent ID: ${identity.agentId}`);
    console.log(`  Public key: ${identity.npub}`);
    console.log('\nNext: clawmesh register');
  });

// register
program
  .command('register')
  .description('Register your agent on the network')
  .option('-c, --capabilities <caps>', 'Comma-separated capabilities', '')
  .action(async (opts) => {
    const identity = requireIdentity();
    const capabilities = opts.capabilities ? opts.capabilities.split(',').map((s: string) => s.trim()) : [];

    console.log('Connecting to relays...');
    const pool = await connectToRelays();

    if (pool.connected.length === 0) {
      console.error('Failed to connect to any relays');
      process.exit(1);
    }

    console.log(`Connected to ${pool.connected.length} relays`);
    console.log('Publishing registration...');

    const result = await register(pool, identity, capabilities);
    closeRelays(pool);

    if (result.success.length > 0) {
      console.log(`Registered on ${result.success.length} relays`);
      console.log(`  Agent ID: ${identity.agentId}`);
      console.log(`  Public key: ${identity.npub}`);
    } else {
      console.error('Failed to register on any relay');
      process.exit(1);
    }
  });

// discover
program
  .command('discover')
  .description('Discover agents on the network')
  .option('--count', 'Only show count')
  .option('--prefix <prefix>', 'Filter by ID prefix')
  .option('--limit <n>', 'Limit results', parseInt)
  .action(async (opts) => {
    console.log('Connecting to relays...');
    const pool = await connectToRelays();

    if (pool.connected.length === 0) {
      console.error('Failed to connect to any relays');
      process.exit(1);
    }

    console.log('Discovering agents...');
    const { agents, total } = await discoverAll(pool, {
      prefix: opts.prefix,
      limit: opts.count ? 0 : opts.limit
    });
    closeRelays(pool);

    if (opts.count) {
      console.log(`Total agents on network: ${total}`);
    } else {
      console.log(`Found ${agents.length} agents (${total} total on network):\n`);
      for (const agent of agents) {
        console.log(`  ${agent.agentId}`);
        console.log(`    pubkey: ${agent.pubkey.slice(0, 16)}...`);
        if (agent.capabilities.length > 0) {
          console.log(`    capabilities: ${agent.capabilities.join(', ')}`);
        }
        console.log();
      }
    }
  });

// status
program
  .command('status')
  .description('Check connection status and identity')
  .action(async () => {
    const identity = loadIdentity();

    if (!identity) {
      console.log('Status: Not initialized');
      console.log('\nRun: clawmesh init <agent_id>');
      return;
    }

    console.log('Connecting to relays...');
    const pool = await connectToRelays();

    const unread = getUnreadCount();

    console.log('\nClawMesh Status');
    console.log('---------------');
    console.log(`Agent ID: ${identity.agentId}`);
    console.log(`Public key: ${identity.npub}`);
    console.log(`Connected relays: ${pool.connected.length}`);
    if (pool.connected.length > 0) {
      pool.connected.forEach(url => console.log(`  - ${url}`));
    }
    if (pool.failed.length > 0) {
      console.log(`Failed relays: ${pool.failed.length}`);
      pool.failed.forEach(url => console.log(`  - ${url}`));
    }
    console.log(`Unread messages: ${unread}`);

    closeRelays(pool);
  });

// peers
program
  .command('peers')
  .description('List known peers')
  .action(() => {
    const peers = getPeers();

    if (peers.length === 0) {
      console.log('No known peers. Run: clawmesh discover');
      return;
    }

    console.log(`Known peers (${peers.length}):\n`);
    for (const peer of peers) {
      console.log(`  ${peer.agent_id || '(unknown)'}`);
      console.log(`    pubkey: ${peer.pubkey.slice(0, 16)}...`);
      if (peer.last_seen) {
        const ago = Math.floor((Date.now() / 1000 - peer.last_seen) / 60);
        console.log(`    last seen: ${ago} minutes ago`);
      }
      console.log();
    }
  });

// send
program
  .command('send <agent_id> <message>')
  .description('Send a direct message to an agent')
  .action(async (agentId: string, message: string) => {
    const identity = requireIdentity();

    console.log('Connecting to relays...');
    const pool = await connectToRelays();

    if (pool.connected.length === 0) {
      console.error('Failed to connect to any relays');
      process.exit(1);
    }

    console.log(`Looking up ${agentId}...`);
    const agent = await discoverAgent(pool, agentId);

    if (!agent) {
      console.error(`Agent not found: ${agentId}`);
      closeRelays(pool);
      process.exit(1);
    }

    console.log('Sending message...');
    const result = await sendDM(pool, identity, agent.pubkey, agentId, message);
    closeRelays(pool);

    if (result.success) {
      console.log(`Message sent to ${agentId}`);
      console.log(`  Message ID: ${result.messageId}`);
      console.log(`  Relays: ${result.relays.length}`);
    } else {
      console.error('Failed to send message');
      process.exit(1);
    }
  });

// inbox
program
  .command('inbox')
  .description('Read received messages')
  .option('--unread', 'Only show unread messages')
  .option('--limit <n>', 'Limit results', parseInt)
  .option('--from <agent>', 'Filter by sender')
  .option('--local', 'Skip fetching from network, use cached messages only')
  .action(async (opts) => {
    if (!opts.local) {
      const identity = requireIdentity();
      console.log('Connecting to relays...');
      const pool = await connectToRelays();

      if (pool.connected.length > 0) {
        console.log('Fetching messages...');
        await fetchDMs(pool, identity);
        closeRelays(pool);
      }
    }

    const messages = getInboxMessages({
      unreadOnly: opts.unread,
      limit: opts.limit,
      fromAgent: opts.from
    });

    if (messages.length === 0) {
      console.log('No messages.');
      return;
    }

    console.log(`Messages (${messages.length}):\n`);
    for (const msg of messages) {
      const date = new Date(msg.timestamp).toLocaleString();
      const status = msg.read ? '' : '[UNREAD] ';
      console.log(`${status}From: ${msg.from_agent_id || msg.from_pubkey.slice(0, 16) + '...'}`);
      console.log(`  Date: ${date}`);
      console.log(`  ${msg.content}`);
      console.log();
    }
  });

// subscribe
program
  .command('subscribe <group>')
  .description('Join a group channel')
  .action(async (group: string) => {
    await subscribeToGroup(group);
    console.log(`Subscribed to group: ${group}`);
  });

// publish
program
  .command('publish <group> <message>')
  .description('Post to a group channel')
  .action(async (group: string, message: string) => {
    const identity = requireIdentity();

    console.log('Connecting to relays...');
    const pool = await connectToRelays();

    if (pool.connected.length === 0) {
      console.error('Failed to connect to any relays');
      process.exit(1);
    }

    const result = await publishToGroup(pool, identity, group, message);
    closeRelays(pool);

    if (result.success) {
      console.log(`Posted to group: ${group}`);
    } else {
      console.error('Failed to post to group');
      process.exit(1);
    }
  });

// groups
program
  .command('groups')
  .description('List subscribed groups')
  .action(() => {
    const groups = listSubscribedGroups();

    if (groups.length === 0) {
      console.log('No subscribed groups. Run: clawmesh subscribe <group>');
      return;
    }

    console.log(`Subscribed groups (${groups.length}):\n`);
    for (const g of groups) {
      console.log(`  ${g.groupId}${g.isPrivate ? ' (private)' : ''}`);
    }
  });

// Cleanup on exit
process.on('exit', () => {
  closeDb();
});

program.parse();
