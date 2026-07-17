import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NetworkInterfaceInfo } from 'node:os';
import { findLanIPv4Addresses } from './network.js';

const address = (value: string, internal = false): NetworkInterfaceInfo => ({
  address: value,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: null,
});

test('findLanIPv4Addresses keeps usable physical IPv4 addresses', () => {
  const result = findLanIPv4Addresses({
    'Wi-Fi': [address('192.168.1.25')],
    Ethernet: [address('10.0.0.8')],
    Loopback: [address('127.0.0.1', true)],
    'vEthernet (WSL)': [address('172.20.0.1')],
    Disconnected: undefined,
  });

  assert.deepEqual(result, ['10.0.0.8', '192.168.1.25']);
});
