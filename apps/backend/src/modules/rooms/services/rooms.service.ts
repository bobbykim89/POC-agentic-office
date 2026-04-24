import { Injectable } from '@nestjs/common';
import { RoomsRepository } from '../repositories/rooms.repository';

@Injectable()
export class RoomsService {
  constructor(private readonly roomsRepository: RoomsRepository) {
    void this.roomsRepository;
  }
}
