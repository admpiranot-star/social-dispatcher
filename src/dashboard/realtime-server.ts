/**
 * Real-time Server
 * WebSocket server para comunicação em tempo real com o dashboard
 * P0 #10: Memory leak cleanup - inactivity timeout, graceful shutdown, event listener cleanup
 */

import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../lib/logger';
import { queueStateManager } from '../queue/queue-state';
import { engagementAggregator } from '../engagement/aggregator';
import { SocialChannel } from '../types';

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10 * 1000; // 10 seconds

interface ClientMeta {
  lastActivity: number;
  isAlive: boolean;
}

export class RealtimeServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientMeta> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private inactivityInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  /**
   * Iniciar servidor WebSocket
   */
  start(server: any): void {
    if (this.isShuttingDown) {
      logger.warn({}, 'Cannot start: server is shutting down');
      return;
    }

    try {
      this.wss = new WebSocketServer({ noServer: true });

      server.on("upgrade", (request: any, socket: any, head: any) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
        if (pathname === "/ws") {
          this.wss?.handleUpgrade(request, socket, head, (ws) => {
            this.wss?.emit("connection", ws, request);
          });
        } else {
          socket.destroy();
        }
      });

      this.wss.on('connection', (ws: WebSocket) => {
        if (this.isShuttingDown) {
          ws.close(1001, 'Server is shutting down');
          return;
        }

        logger.info({ totalClients: this.clients.size + 1 }, 'Dashboard: new client connected');
        this.clients.set(ws, { lastActivity: Date.now(), isAlive: true });

        // Send initial state
        this.sendInitialState(ws);

        // Handle pong (heartbeat response)
        ws.on('pong', () => {
          const meta = this.clients.get(ws);
          if (meta) {
            meta.isAlive = true;
            meta.lastActivity = Date.now();
          }
        });

        // Handle messages
        ws.on('message', (data: Buffer) => {
          const meta = this.clients.get(ws);
          if (meta) {
            meta.lastActivity = Date.now();
          }
          try {
            const message = JSON.parse(data.toString());
            this.handleClientMessage(ws, message);
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.warn({ error: errMsg }, 'Error parsing client message');
          }
        });

        // Handle disconnect
        ws.on('close', () => {
          logger.info({ totalClients: this.clients.size - 1 }, 'Dashboard: client disconnected');
          this.cleanupClient(ws);
        });

        ws.on('error', (err: Error) => {
          logger.error({ error: err.message }, 'WebSocket error');
          this.cleanupClient(ws);
        });
      });

      this.wss.on('error', (err: Error) => {
        logger.error({ error: err.message }, 'WebSocket server error');
      });

      // Broadcast updates every 5 seconds
      this.updateInterval = setInterval(() => {
        this.broadcastQueueUpdates();
      }, 5000);

      // Heartbeat check every 30 seconds
      this.heartbeatInterval = setInterval(() => {
        this.checkHeartbeats();
      }, HEARTBEAT_INTERVAL_MS);

      // Inactivity cleanup every 60 seconds
      this.inactivityInterval = setInterval(() => {
        this.cleanupInactiveClients();
      }, 60_000);

      logger.info('Dashboard WebSocket server started');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errMsg }, 'Error starting WebSocket server');
      throw err;
    }
  }

  /**
   * Heartbeat: ping all clients, terminate unresponsive ones
   */
  private checkHeartbeats(): void {
    for (const [ws, meta] of this.clients) {
      if (!meta.isAlive) {
        logger.info({}, 'Terminating unresponsive WebSocket client');
        this.cleanupClient(ws);
        ws.terminate();
        continue;
      }
      meta.isAlive = false;
      try {
        ws.ping();
      } catch {
        this.cleanupClient(ws);
        ws.terminate();
      }
    }
  }

  /**
   * Remove inactive clients (no activity for INACTIVITY_TIMEOUT_MS)
   */
  private cleanupInactiveClients(): void {
    const now = Date.now();
    for (const [ws, meta] of this.clients) {
      if (now - meta.lastActivity > INACTIVITY_TIMEOUT_MS) {
        logger.info(
          { inactiveMs: now - meta.lastActivity },
          'Closing inactive WebSocket client'
        );
        ws.close(1000, 'Inactivity timeout');
        this.cleanupClient(ws);
      }
    }
  }

  /**
   * Cleanup a single client: remove from map, remove all listeners
   */
  private cleanupClient(ws: WebSocket): void {
    this.clients.delete(ws);
    ws.removeAllListeners();
  }

  /**
   * Enviar estado inicial ao cliente
   */
  private async sendInitialState(ws: WebSocket): Promise<void> {
    try {
      const stats = await queueStateManager.getAllQueueStats();

      this.safeSend(ws, {
        type: 'initial_state',
        timestamp: new Date().toISOString(),
        queues: stats,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Error sending initial state');
    }
  }

  /**
   * Broadcast atualizações de fila para todos os clientes
   */
  private async broadcastQueueUpdates(): Promise<void> {
    try {
      if (this.clients.size === 0) return;

      const stats = await queueStateManager.getAllQueueStats();
      const channels = Object.keys(stats) as SocialChannel[];

      for (const channel of channels) {
        const queueItems = await queueStateManager.getQueueState(channel);
        const topItems = queueItems.slice(0, 10);

        const message = {
          type: 'queue_update',
          channel,
          timestamp: new Date().toISOString(),
          queueLength: queueItems.length,
          topItems: topItems.map((item) => ({
            postId: item.postId,
            scheduledAt: item.scheduledAt.toISOString(),
            position: item.queuePosition,
            priority: item.priorityScore,
            reprioritized: item.reprioritizedCount,
          })),
        };

        this.broadcast(message);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Error broadcasting queue updates');
    }
  }

  /**
   * Enviar notificação de publicação bem-sucedida
   */
  publishedNotification(postId: string, channel: SocialChannel, externalId: string): void {
    this.broadcast({
      type: 'post_published',
      timestamp: new Date().toISOString(),
      postId,
      channel,
      externalId,
      icon: this.getChannelIcon(channel),
    });
  }

  /**
   * Enviar notificação de reprioritização
   */
  reprioritizationNotification(
    postId: string,
    oldPosition: number,
    newPosition: number,
    reason: string
  ): void {
    this.broadcast({
      type: 'post_reprioritized',
      timestamp: new Date().toISOString(),
      postId,
      oldPosition,
      newPosition,
      reason,
    });
  }

  /**
   * Enviar notificação de erro
   */
  errorNotification(postId: string, channel: SocialChannel, error: string): void {
    this.broadcast({
      type: 'post_error',
      timestamp: new Date().toISOString(),
      postId,
      channel,
      error,
    });
  }

  /**
   * Enviar high engagement alert
   */
  highEngagementAlert(postId: string, channel: SocialChannel, engagementRate: number): void {
    this.broadcast({
      type: 'high_engagement',
      timestamp: new Date().toISOString(),
      postId,
      channel,
      engagementRate: engagementRate.toFixed(2),
    });
  }

  /**
   * Processar mensagem do cliente
   */
  private handleClientMessage(ws: WebSocket, message: Record<string, unknown>): void {
    try {
      switch (message.type) {
        case 'subscribe_channel':
          logger.info({ channel: message.channel }, 'Client subscribed to channel');
          break;

        case 'request_queue_state':
          this.sendQueueState(ws, String(message.channel));
          break;

        case 'request_trending':
          this.sendTrendingPosts(ws);
          break;

        default:
          logger.debug({ messageType: message.type }, 'Unknown client message type');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errMsg }, 'Error processing client message');
    }
  }

  /**
   * Enviar estado completo da fila para um cliente
   */
  private async sendQueueState(ws: WebSocket, channel: string): Promise<void> {
    try {
      const items = await queueStateManager.getQueueState(channel as SocialChannel);

      this.safeSend(ws, {
        type: 'queue_state',
        channel,
        timestamp: new Date().toISOString(),
        items: items.map((item) => ({
          postId: item.postId,
          scheduledAt: item.scheduledAt.toISOString(),
          position: item.queuePosition,
          priority: item.priorityScore,
          reprioritized: item.reprioritizedCount,
        })),
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg, channel }, 'Error sending queue state');
    }
  }

  /**
   * Enviar posts trending
   */
  private async sendTrendingPosts(ws: WebSocket): Promise<void> {
    try {
      const trending = await engagementAggregator.getTrendingPosts(5);

      this.safeSend(ws, {
        type: 'trending_posts',
        timestamp: new Date().toISOString(),
        posts: trending,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Error sending trending posts');
    }
  }

  /**
   * Safe send: checks readyState before sending
   */
  private safeSend(ws: WebSocket, message: Record<string, unknown>): void {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.debug({ error: errMsg }, 'Error sending to client');
        this.cleanupClient(ws);
      }
    }
  }

  /**
   * Broadcast mensagem para todos os clientes
   */
  private broadcast(message: Record<string, unknown>): void {
    const data = JSON.stringify(message);

    for (const [client] of this.clients) {
      if (client.readyState === client.OPEN) {
        try {
          client.send(data);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.debug({ error: errMsg }, 'Error sending to client');
          this.cleanupClient(client);
        }
      }
    }
  }

  /**
   * Parar servidor (cleanup all intervals)
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.inactivityInterval) {
      clearInterval(this.inactivityInterval);
      this.inactivityInterval = null;
    }

    // Close all clients
    for (const [client] of this.clients) {
      try {
        client.close(1001, 'Server stopping');
      } catch {
        client.terminate();
      }
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.removeAllListeners();
      this.wss.close();
      this.wss = null;
      logger.info({}, 'Dashboard WebSocket server stopped');
    }
  }

  /**
   * Graceful shutdown: notify clients, wait for close, then stop
   */
  async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info({ clientCount: this.clients.size }, 'Initiating graceful WebSocket shutdown');

    // Notify all clients
    this.broadcast({
      type: 'server_shutdown',
      timestamp: new Date().toISOString(),
      message: 'Server is shutting down',
    });

    // Give clients time to disconnect gracefully
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

      // If all clients disconnect early, resolve immediately
      const checkEmpty = setInterval(() => {
        if (this.clients.size === 0) {
          clearInterval(checkEmpty);
          clearTimeout(timeout);
          resolve();
        }
      }, 500);
    });

    this.stop();
    logger.info({}, 'Graceful WebSocket shutdown complete');
  }

  /**
   * Helper: obter ícone do channel
   */
  private getChannelIcon(channel: SocialChannel): string {
    const icons: Record<SocialChannel, string> = {
      facebook: 'fb',
      instagram: 'ig',
      whatsapp: 'wa',
      tiktok: 'tt',
      twitter: 'tw',
      linkedin: 'li',
    };

    return icons[channel] || 'social';
  }
}

export const realtimeServer = new RealtimeServer();
