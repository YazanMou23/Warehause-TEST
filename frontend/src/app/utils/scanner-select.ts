export interface ConnectorScanner {
  id: string;
  name: string;
  displayName?: string;
  connectionType?: string;
  ip?: string | null;
  protocol?: string;
  capabilities?: { scanning?: boolean };
}

/** Only real scanners; never the built-in test simulator. */
export function selectableScanners(devices: ConnectorScanner[]): ConnectorScanner[] {
  return (devices || []).filter(
    (d) => d && d.id && d.capabilities?.scanning !== false && !/simulator/i.test(`${d.id} ${d.name}`),
  );
}

export function pickScanner(devices: ConnectorScanner[], lastId: string | null): ConnectorScanner | null {
  const list = selectableScanners(devices);
  if (!list.length) return null;
  const remembered = lastId ? list.find((d) => d.id === lastId) : undefined;
  if (remembered) return remembered;
  return list.length === 1 ? list[0] : null;
}

