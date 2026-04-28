/**
 * Video Processor
 * Extrai frames de vídeos para uso em templates de arte
 * Requer FFmpeg instalado no sistema
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { logger } from '../lib/logger';

const execFileAsync = promisify(execFile);

export class VideoProcessor {
  private tempDir = '/tmp/piranot-video-frames';

  /**
   * Extrair frame de um vídeo
   * Retorna caminho da imagem extraída (JPG)
   */
  async extractFrame(videoPath: string, timeSeconds: number = 1): Promise<string> {
    try {
      // Validar arquivo
      if (!existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      // Gerar nome único para o frame
      const frameFileName = `frame-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const outputPath = join(this.tempDir, frameFileName);

      // Executar FFmpeg para extrair frame (SAFE: using execFile with args array)
      try {
        await execFileAsync('ffmpeg', [
          '-i', videoPath,
          '-ss', timeSeconds.toString(),
          '-vframes', '1',
          '-q:v', '2',
          outputPath,
          '-y'
        ]);
      } catch (err: any) {
        // FFmpeg pode retornar status não-zero mesmo com sucesso
        // Verificar se arquivo foi criado
        if (!existsSync(outputPath)) {
          throw new Error(
            `FFmpeg failed to extract frame. Make sure FFmpeg is installed: ${err.message}`
          );
        }
      }

      logger.info({ videoPath, outputPath, timeSeconds }, '✂️ Frame extraído do vídeo');
      return outputPath;
    } catch (err: any) {
      logger.error({ error: err.message, videoPath }, 'Erro ao processar vídeo');
      throw err;
    }
  }

  /**
   * Extrair múltiplos frames de um vídeo
   */
  async extractMultipleFrames(
    videoPath: string,
    timestamps: number[] = [1, 3, 5]
  ): Promise<string[]> {
    try {
      const frames = await Promise.all(
        timestamps.map((ts) => this.extractFrame(videoPath, ts))
      );

      logger.info({ videoPath, count: frames.length }, '🎬 Múltiplos frames extraídos');
      return frames;
    } catch (err: any) {
      logger.error({ error: err.message, videoPath }, 'Erro ao extrair múltiplos frames');
      throw err;
    }
  }

  /**
   * Obter duração de um vídeo (em segundos)
   */
  async getVideoDuration(videoPath: string): Promise<number> {
    try {
      if (!existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      // SAFE: using execFile with args array
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1:noinline=1',
        videoPath
      ]);
      const duration = parseFloat(stdout.trim());

      if (isNaN(duration)) {
        throw new Error('Could not determine video duration');
      }

      logger.info({ videoPath, durationSeconds: duration }, '⏱️ Duração do vídeo obtida');
      return duration;
    } catch (err: any) {
      logger.error(
        { error: err.message, videoPath },
        'Erro ao obter duração (FFprobe pode não estar instalado)'
      );
      // Retornar duração padrão se FFprobe falhar
      return 10;
    }
  }

  /**
   * Limpar frames temporários
   */
  async cleanup(framePath: string): Promise<void> {
    try {
      if (existsSync(framePath)) {
        unlinkSync(framePath);
        logger.debug({ framePath }, 'Frame temporário removido');
      }
    } catch (err: any) {
      logger.warn({ error: err.message, framePath }, 'Erro ao limpar frame temporário');
    }
  }

  /**
   * Validar se vídeo é válido
   */
  async isValidVideo(videoPath: string): Promise<boolean> {
    try {
      if (!existsSync(videoPath)) {
        return false;
      }

      // SAFE: using execFile with args array
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
        videoPath
      ]);

      return stdout.trim() === 'video';
    } catch (err: any) {
      logger.warn({ error: err.message }, 'FFprobe não disponível');
      return true; // Assumir válido se FFprobe não está disponível
    }
  }
}

export const videoProcessor = new VideoProcessor();
