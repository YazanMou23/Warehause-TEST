import { ForbiddenException } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

describe('Webhook verify-token exposure cleanup', () => {
  const OLD_ENV = process.env;
  let controller: MessagingController;
  let service: MessagingService;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    service = new MessagingService({} as any);
    controller = new MessagingController(service);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  describe('GET webhook verification', () => {
    it('rejects verification when env token is not configured', () => {
      expect(() =>
        controller.verifyWebhook('subscribe', 'anything', 'challenge-1'),
      ).toThrow(ForbiddenException);
    });

    it('rejects blank env token', () => {
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = '   ';
      expect(() =>
        controller.verifyWebhook('subscribe', 'anything', 'challenge-1'),
      ).toThrow(ForbiddenException);
    });

    it('returns challenge when env token matches', () => {
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'my-secret-token';
      expect(
        controller.verifyWebhook('subscribe', 'my-secret-token', 'challenge-42'),
      ).toBe('challenge-42');
    });

    it('rejects wrong token when configured', () => {
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'my-secret-token';
      expect(() =>
        controller.verifyWebhook('subscribe', 'wrong', 'challenge-42'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('getWebhookStatus', () => {
    it('reports verifyTokenConfigured=false without exposing any token', () => {
      const status = service.getWebhookStatus() as any;
      expect(status.verifyTokenConfigured).toBe(false);
      expect(status).not.toHaveProperty('verifyToken');
      expect(JSON.stringify(status)).not.toContain('logiflow');
    });

    it('reports verifyTokenConfigured=true without exposing the token value', () => {
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'my-secret-token';
      const status = service.getWebhookStatus() as any;
      expect(status.verifyTokenConfigured).toBe(true);
      expect(status).not.toHaveProperty('verifyToken');
      expect(JSON.stringify(status)).not.toContain('my-secret-token');
    });
  });
});
