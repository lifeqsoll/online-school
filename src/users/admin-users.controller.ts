import { Controller, Get, UseGuards } from '@nestjs/common';
import { GlobalRole } from '@prisma/client';
import { Roles } from '../rbac/decorators/roles.decorator';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { UsersService } from './users.service';

@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles(GlobalRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.listForAdmin();
  }
}
