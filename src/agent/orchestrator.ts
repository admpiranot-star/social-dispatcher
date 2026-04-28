/**
 * Agent Orchestrator
 * Coordena os 3 especialistas (Architect, Strategist, Operator)
 * para tomar decisões inteligentes sobre scheduling e repriorização
 */

import { logger } from '../lib/logger';
import { QueueState, SocialPostPayload, ReprioritizationDecision, AgentVote } from '../types';
import { Architect } from './specialists/architect';
import { Strategist } from './specialists/strategist';
import { Operator } from './specialists/operator';
import { councilDecision } from './council-decision';

export class Orchestrator {
  private architect: Architect;
  private strategist: Strategist;
  private operator: Operator;

  constructor() {
    this.architect = new Architect();
    this.strategist = new Strategist();
    this.operator = new Operator();
  }

  /**
   * MAIN FUNCTION: Orquestrar decisão de scheduling para novo post
   * Chamado pelo dispatcher quando POST /dispatch chega
   */
  async orchestrateNewPost(post: SocialPostPayload): Promise<{
    scheduledAt: Date;
    priorityScore: number;
    reasoning: string;
  }> {
    const correlationId = post.metadata?.sourceId || 'unknown';
    logger.info({ postId: post.id, correlationId }, '🤖 Agente analisando novo post');

    try {
      // 1. Arquiteto: Avaliar fila dinâmica e constraints técnicos
      const architectVote = await this.architect.evaluatePost(post);

      // 2. Estrategista: Analisar category, engagement histórico, timing ótimo
      const strategistVote = await this.strategist.evaluatePost(post);

      // 3. Operador: Considerar sinais do usuário, notificações
      const operatorVote = await this.operator.evaluatePost(post);

      // 4. Conselho: Agregar votos e tomar decisão
      const decision = await councilDecision.makeDecision(
        architectVote,
        strategistVote,
        operatorVote,
        post
      );

      logger.info(
        {
          postId: post.id,
          scheduledAt: decision.scheduledAt,
          priorityScore: decision.priorityScore,
          consensus: decision.consensus,
        },
        '✅ Agente decidiu scheduling'
      );

      return {
        scheduledAt: decision.scheduledAt,
        priorityScore: decision.priorityScore,
        reasoning: decision.reasoning,
      };
    } catch (err: any) {
      logger.error({ error: err.message, postId: post.id }, 'Erro ao orquestrar decisão');
      throw err;
    }
  }

  /**
   * REPRIORITIZE: Agente detecta engajamento alto, decide se deve reprioritizar
   * Chamado periodicamente (a cada 30s) pelo aggregator
   */
  async orchestrateReprioritization(currentQueueState: QueueState[]): Promise<ReprioritizationDecision[]> {
    const decisions: ReprioritizationDecision[] = [];

    logger.debug({ queueLength: currentQueueState.length }, '🔄 Avaliando reprioritização');

    try {
      for (const queueItem of currentQueueState.slice(0, 5)) {
        // Analisar apenas top 5 na fila
        try {
          // 1. Arquiteto: Detectar race conditions, limites técnicos
          const architectVote = await this.architect.evaluateReprioritization(queueItem);

          // 2. Estrategista: Analisar engagement, trending, timing
          const strategistVote = await this.strategist.evaluateReprioritization(queueItem);

          // 3. Operador: Considerar sinais do editor
          const operatorVote = await this.operator.evaluateReprioritization(queueItem);

          // 4. Conselho: Votar em reprioritização
          const shouldReprioritize = await councilDecision.shouldReprioritize(
            architectVote,
            strategistVote,
            operatorVote
          );

          if (shouldReprioritize) {
            const newScheduledAt = new Date(
              Date.now() + ((strategistVote as any).recommendedDelay || 0)
            );
            decisions.push({
              postId: queueItem.postId,
              oldScheduledAt: queueItem.scheduledAt,
              newScheduledAt,
              oldQueuePosition: queueItem.queuePosition,
              newQueuePosition: 1, // Mover para topo
              reason: ((strategistVote as any).reason || 'system_optimization'),
              agentDecision: {
                architectVote: {
                  score: architectVote.score,
                  rationale: architectVote.rationale,
                },
                strategistVote: {
                  score: strategistVote.score,
                  rationale: strategistVote.rationale,
                  expectedEngagement: ((strategistVote as any).expectedEngagement || 0),
                },
                operatorVote: {
                  score: operatorVote.score,
                  rationale: operatorVote.rationale,
                },
                consensus: (architectVote.score + strategistVote.score + operatorVote.score) / 30, // 0-1
              },
              triggeredBy: 'system',
              createdAt: new Date(),
            });

            logger.info(
              { postId: queueItem.postId, reason: (strategistVote as any).reason },
              '📍 Post reprioritizado'
            );
          }
        } catch (itemErr: any) {
          logger.warn({ error: itemErr.message, postId: queueItem.postId }, 'Erro ao avaliar item');
        }
      }

      return decisions;
    } catch (err: any) {
      logger.error({ error: err.message }, 'Erro ao orquestrar reprioritização');
      throw err;
    }
  }

  /**
   * EDITOR OVERRIDE: Editor quer reprioritizar manualmente
   * O agente valida a decisão e aplica se OK
   */
  async orchestrateEditorOverride(
    postId: string,
    newScheduledAt: Date,
    reason: string
  ): Promise<ReprioritizationDecision> {
    logger.info({ postId, newScheduledAt, reason }, '👤 Editor request: reprioritização manual');

    try {
      // Validar via Operator (UI layer)
      const operatorApproval = await this.operator.validateEditorInput(
        postId,
        newScheduledAt,
        reason
      );

      if (!operatorApproval.isValid) {
        throw new Error(`Invalid editor input: ${operatorApproval.error}`);
      }

      const decision: ReprioritizationDecision = {
        postId,
        oldScheduledAt: new Date(), // TODO: fetch from DB
        newScheduledAt,
        oldQueuePosition: 0, // TODO: fetch from DB
        newQueuePosition: 1,
        reason: 'manual_override',
        agentDecision: {
          architectVote: { score: 10, rationale: 'Editor override approved' },
          strategistVote: {
            score: 10,
            rationale: 'Editor knows business context',
            expectedEngagement: 0,
          },
          operatorVote: { score: 10, rationale: 'Editor validated input' },
          consensus: 1.0,
        },
        triggeredBy: 'user',
        createdAt: new Date(),
      };

      logger.info({ postId }, '✅ Editor override approved');
      return decision;
    } catch (err: any) {
      logger.error({ error: err.message, postId }, 'Erro ao processar editor override');
      throw err;
    }
  }

  /**
   * Health check: Agente está funcionando OK?
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.architect.healthCheck();
      await this.strategist.healthCheck();
      await this.operator.healthCheck();
      return true;
    } catch {
      return false;
    }
  }
}

export const orchestrator = new Orchestrator();
