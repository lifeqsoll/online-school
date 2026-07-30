import { Injectable } from '@nestjs/common';

@Injectable()
export class Neo4jService {
  isEnabled(): boolean {
    return false;
  }

  health() {
    return { status: 'disabled' as const };
  }
}
