import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../rbac/auth-user';
import { EngagementDto, EngagementService } from './engagement.service';

@Controller('lessons')
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Post(':id/engagement')
  record(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EngagementDto,
  ) {
    return this.engagement.record(user, id, dto);
  }
}
