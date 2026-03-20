import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { RealtimeGateway } from './realtime/realtime.gateway';

@Module({
  imports: [DatabaseModule],
  controllers: [AppController],
  providers: [AppService, RealtimeGateway],
})
export class AppModule {}
