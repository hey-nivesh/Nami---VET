/**
 * Filter Engine — GPU-accelerated Canvas-based filter rendering system.
 *
 * Applies visual effects stack (e.g. brightness, contrast, black & white, vignette)
 * in real-time on top of video frames.
 */

export interface Effect {
  id: string;
  type: 'brightness' | 'contrast' | 'saturation' | 'blur' | 'black_and_white' | 'warmth' | 'vignette';
  enabled: boolean;
  parameters: Record<string, any>;
}

export class FilterEngine {
  /**
   * Apply a list of visual filters to a canvas context.
   */
  static applyFilters(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    effects: Effect[]
  ) {
    if (!effects || effects.length === 0) {
      ctx.filter = 'none';
      return;
    }

    let filterString = '';
    let vignetteEffect: Effect | null = null;

    for (const eff of effects) {
      if (!eff.enabled) continue;

      const p = eff.parameters || {};

      switch (eff.type) {
        case 'brightness': {
          // Amount ranges from 0 to 200, default 100
          const amount = p.amount !== undefined ? p.amount : 100;
          filterString += ` brightness(${amount}%)`;
          break;
        }
        case 'contrast': {
          // Amount ranges from 0 to 200, default 100
          const amount = p.amount !== undefined ? p.amount : 100;
          filterString += ` contrast(${amount}%)`;
          break;
        }
        case 'saturation': {
          // Amount ranges from 0 to 200, default 100
          const amount = p.amount !== undefined ? p.amount : 100;
          filterString += ` saturate(${amount}%)`;
          break;
        }
        case 'black_and_white': {
          filterString += ' grayscale(100%)';
          break;
        }
        case 'blur': {
          // Blur ranges from 0 to 20px, default 0
          const radius = p.radius !== undefined ? p.radius : 4;
          filterString += ` blur(${radius}px)`;
          break;
        }
        case 'warmth': {
          // Simulating warmth with a custom combination of sepia & brightness
          const amount = p.amount !== undefined ? p.amount : 30;
          filterString += ` sepia(${amount}%)`;
          break;
        }
        case 'vignette': {
          vignetteEffect = eff;
          break;
        }
        default:
          break;
      }
    }

    // Apply native filters in one GPU-accelerated draw operation
    ctx.filter = filterString.trim() || 'none';

    // Draw vignette overlay if enabled
    if (vignetteEffect) {
      const p = vignetteEffect.parameters || {};
      const intensity = p.intensity !== undefined ? p.intensity : 0.6; // 0 to 1
      
      const gradient = ctx.createRadialGradient(
        width / 2, height / 2, width / 4,
        width / 2, height / 2, Math.sqrt((width / 2) ** 2 + (height / 2) ** 2)
      );
      
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);
      
      ctx.save();
      // Reset filter so vignette itself isn't blurred or brightened
      ctx.filter = 'none';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
}
