import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

type NetworkInterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

const VIRTUAL_INTERFACE_PATTERN = /loopback|virtual|vmware|vbox|hyper-v|vethernet|wsl|docker|bluetooth/i;

export function findLanIPv4Addresses(interfaces: NetworkInterfaceMap = networkInterfaces()): string[] {
  const addresses = new Set<string>();

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries || VIRTUAL_INTERFACE_PATTERN.test(name)) continue;
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('127.') || entry.address.startsWith('169.254.')) continue;
      addresses.add(entry.address);
    }
  }

  return [...addresses].sort();
}

export function logLanStartupUrls(host: string, coordinatorPort: number, uiPort = 3000): void {
  console.log(`[coord] bound to http://${host}:${coordinatorPort}`);
  console.log(`[coord] local UI: http://localhost:${uiPort}`);
  console.log(`[coord] local health: http://localhost:${coordinatorPort}/health`);

  const addresses = host === '0.0.0.0' ? findLanIPv4Addresses() : [];
  if (addresses.length === 0) {
    console.log('[coord] no usable IPv4 LAN address detected; use ipconfig to find the Windows Wi-Fi address');
    return;
  }

  for (const address of addresses) {
    console.log(`[coord] LAN UI: http://${address}:${uiPort}`);
    console.log(`[coord] LAN health: http://${address}:${coordinatorPort}/health`);
    console.log(`[coord] tablet: http://${address}:${uiPort}/int-secondary`);
  }
}
