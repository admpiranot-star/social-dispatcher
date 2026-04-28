import { SocialDispatcher } from '../src/dispatcher';
import { SocialPostPayload } from '../src/types';

describe('SocialDispatcher', () => {
  let dispatcher: SocialDispatcher;

  beforeEach(() => {
    dispatcher = new SocialDispatcher();
  });

  it('should calculate zero delay for immediate posts', () => {
    const payload: Partial<SocialPostPayload> = {
      id: 'test-1',
      scheduled_at: undefined
    };
    // @ts-ignore
    const delay = dispatcher.calculateTimingDelay(payload);
    expect(delay).toBe(0);
  });

  it('should calculate correct delay for future posts', () => {
    const futureDate = new Date(Date.now() + 10000).toISOString();
    const payload: Partial<SocialPostPayload> = {
      id: 'test-2',
      scheduled_at: futureDate
    };
    // @ts-ignore
    const delay = dispatcher.calculateTimingDelay(payload);
    expect(delay).toBeGreaterThan(9000);
    expect(delay).toBeLessThanOrEqual(10000);
  });
});
