import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { Neo4jService } from '../neo4j/neo4j.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly neo4j: Neo4jService,
  ) {}

  @Public()
  @Get()
  async check() {
    let postgres: 'up' | 'down' = 'down';
    let redis: 'up' | 'down' = 'down';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      postgres = 'up';
    } catch {
      postgres = 'down';
    }

    try {
      const pong = await this.redis.ping();
      redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      redis = 'down';
    }

    const neo4j = await this.neo4j.health();
    const status = postgres === 'up' && redis === 'up' ? 'ok' : 'degraded';
    return { status, postgres, redis, neo4j };
  }
}
