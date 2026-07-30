import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Session } from 'neo4j-driver';

@Injectable()
export class Neo4jService implements OnModuleDestroy {
  private driver: Driver | null = null;
  private readonly uri: string;

  constructor(private readonly config: ConfigService) {
    this.uri = this.config.get<string>('neo4j.uri') ?? '';
    if (this.uri) {
      const user = this.config.get<string>('neo4j.user') ?? 'neo4j';
      const password = this.config.get<string>('neo4j.password') ?? '';
      this.driver = neo4j.driver(this.uri, neo4j.auth.basic(user, password));
    }
  }

  isEnabled(): boolean {
    return !!this.driver;
  }

  async health() {
    if (!this.driver) return { status: 'disabled' as const };
    try {
      await this.driver.verifyConnectivity();
      return { status: 'up' as const };
    } catch (e) {
      return {
        status: 'down' as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async run(cypher: string, params: Record<string, unknown> = {}) {
    if (!this.driver) throw new Error('Neo4j disabled');
    const session: Session = this.driver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }

  async onModuleDestroy() {
    if (this.driver) await this.driver.close();
  }
}
