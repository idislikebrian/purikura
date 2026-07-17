export interface CoordinatorUrls {
  http: string;
  websocket: string;
}

export function buildCoordinatorUrls(hostname: string, configuredBase?: string): CoordinatorUrls {
  const http = (configuredBase ?? `http://${hostname}:3001`).replace(/\/$/, '');
  return {
    http,
    websocket: `${http.replace(/^http/, 'ws')}/ws`,
  };
}
