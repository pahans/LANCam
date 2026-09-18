export type Role = 'broadcaster' | 'viewer';

export interface ClientRecord {
  id: string;
  role: Role | null;
  name: string | null;
}

export class Registry {
  private clients = new Map<string, ClientRecord>();

  addClient(id: string): void {
    this.clients.set(id, { id, role: null, name: null });
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  registerBroadcaster(id: string, name: string): void {
    const client = this.clients.get(id);
    if (!client) {
      throw new Error(`cannot register unknown client ${id}`);
    }
    client.role = 'broadcaster';
    client.name = name;
  }

  listBroadcasters(): { id: string; name: string }[] {
    const result: { id: string; name: string }[] = [];
    for (const client of this.clients.values()) {
      if (client.role === 'broadcaster' && client.name !== null) {
        result.push({ id: client.id, name: client.name });
      }
    }
    return result;
  }

  getClient(id: string): ClientRecord | undefined {
    return this.clients.get(id);
  }
}
