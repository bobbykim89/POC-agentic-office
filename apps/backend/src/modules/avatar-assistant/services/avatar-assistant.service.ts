import { Injectable } from '@nestjs/common';
import type {
  AvatarAssistantMessageDto,
  AvatarAssistantPreviewMode,
} from '@agentic-office/shared-types';
import { AssistantNotificationsRepository } from '../repositories/assistant-notifications.repository';
import {
  Proactive515Detector,
  type AvatarAssistantMessageCandidate,
} from './detectors/proactive-515.detector';

@Injectable()
export class AvatarAssistantService {
  constructor(
    private readonly assistantNotificationsRepository: AssistantNotificationsRepository,
    private readonly proactive515Detector: Proactive515Detector,
  ) {}

  async getCurrentMessageForUser(userId: string): Promise<AvatarAssistantMessageDto | null> {
    return this.getCurrentMessageForUserWithPreview(userId);
  }

  async getCurrentMessageForUserWithPreview(
    userId: string,
    previewMode?: AvatarAssistantPreviewMode | null,
  ): Promise<AvatarAssistantMessageDto | null> {
    const previewMessage = this.buildPreviewMessage(previewMode ?? null);
    if (previewMessage) {
      return previewMessage;
    }

    const candidate = await this.selectCandidate(userId);
    if (!candidate) {
      return null;
    }

    const existing = await this.assistantNotificationsRepository.findByUserAndDedupeKey(
      userId,
      candidate.dedupeKey,
    );
    if (existing) {
      return null;
    }

    const saved = await this.assistantNotificationsRepository.create({
      userId,
      kind: candidate.kind,
      priority: candidate.priority,
      title: candidate.title,
      body: candidate.body,
      suggestedAction: candidate.suggestedAction,
      dedupeKey: candidate.dedupeKey,
    });

    return {
      id: saved.id,
      kind: this.toMessageKind(saved.kind),
      priority: this.toPriority(saved.priority),
      title: saved.title,
      body: saved.body,
      suggestedAction: saved.suggestedAction ?? null,
      generatedAt: saved.createdAt.toISOString(),
    };
  }

  private buildPreviewMessage(
    previewMode: AvatarAssistantPreviewMode | null,
  ): AvatarAssistantMessageDto | null {
    if (!previewMode) {
      return null;
    }

    const generatedAt = new Date().toISOString();

    if (previewMode === 'friday_sent') {
      return {
        id: 'preview-friday-sent',
        kind: 'proactive_515',
        priority: 'info',
        title: 'Mini Me',
        body: 'Hey, good job sending that 515. I checked your recent sent mail and it looks like you already got it out today.',
        suggestedAction: null,
        generatedAt,
      };
    }

    if (previewMode === 'friday_reminder') {
      return {
        id: 'preview-friday-reminder',
        kind: 'proactive_515',
        priority: 'important',
        title: 'Mini Me',
        body: "It's Friday afternoon and I don't think your 515 has gone out yet. Want me to help you draft it from this week's work?",
        suggestedAction: {
          type: 'open_weekly_report',
          label: 'Open 515 Generator',
        },
        generatedAt,
      };
    }

    return null;
  }

  private async selectCandidate(userId: string): Promise<AvatarAssistantMessageCandidate | null> {
    return this.proactive515Detector.detect(userId);
  }

  private toMessageKind(kind: string): AvatarAssistantMessageDto['kind'] {
    if (
      kind === 'proactive_515' ||
      kind === 'morning_briefing' ||
      kind === 'breaking_alert' ||
      kind === 'recurring_task' ||
      kind === 'unreplied_email'
    ) {
      return kind;
    }

    return 'proactive_515';
  }

  private toPriority(priority: string): AvatarAssistantMessageDto['priority'] {
    if (priority === 'info' || priority === 'important' || priority === 'urgent') {
      return priority;
    }

    return 'important';
  }
}
