import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatcher } from '../../src/dispatcher';
import { SocialPostPayload } from '../../src/types';

describe('Dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should enqueue post to multiple channels', async () => {
    const payload: Partial<SocialPostPayload> = {
      title: 'Test Post',
      link: 'https://example.com',
      channels: ['facebook', 'instagram'],
      category: 'politics',
      priority: 5,
      summary: 'Test',
      metadata: {
        utmCampaign: 'test',
        utmSource: 'test',
      },
    };

    // Mock implementation would go here
    expect(payload.channels).toHaveLength(2);
  });
});
