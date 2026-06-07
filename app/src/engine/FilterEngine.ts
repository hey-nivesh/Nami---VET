/**
 * Filter Engine — Canvas-based filter and transform renderer.
 *
 * Applies visual effects stack (brightness, contrast, black & white, vignette, etc.)
 * AND per-clip compositing transforms (position, scale, rotation, crop, opacity, blend mode)
 * in real-time on the shared preview canvas.
 */

import type { Clip } from '../store/timelineStore';

export interface Effect {
  id: string;
  type: 'brightness' | 'contrast' | 'saturation' | 'blur' | 'black_and_white' | 'warmth' | 'vignette';
  enabled: boolean;
  parameters: Record<string, any>;
}

export class FilterEngine {
  /**
   * Build the CSS filter string from an effects stack (no vignette — that needs a separate draw call).
   */
  static buildFilterString(effects: Effect[]): string {
    if (!effects || effects.length === 0) return 'none';
    let filterString = '';
    for (const eff of effects) {
      if (!eff.enabled || eff.type === 'vignette') continue;
      const p = eff.parameters || {};
      switch (eff.type) {
        case 'brightness': filterString += ` brightness(${p.amount ?? 100}%)`; break;
        case 'contrast':   filterString += ` contrast(${p.amount ?? 100}%)`; break;
        case 'saturation': filterString += ` saturate(${p.amount ?? 100}%)`; break;
        case 'black_and_white': filterString += ' grayscale(100%)'; break;
        case 'blur':       filterString += ` blur(${p.radius ?? 4}px)`; break;
        case 'warmth':     filterString += ` sepia(${p.amount ?? 30}%)`; break;
      }
    }
    return filterString.trim() || 'none';
  }

  /**
   * Draw a vignette gradient overlay after the video frame has been painted.
   */
  static drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number, intensity = 0.6) {
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, width / 4,
      width / 2, height / 2, Math.sqrt((width / 2) ** 2 + (height / 2) ** 2)
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);
    ctx.save();
    ctx.filter = 'none';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  /**
   * Draw a single clip (video element, image element, or image bitmap) onto the canvas,
   * applying all transform, compositing, crop, and filter properties from the clip.
   *
   * @param ctx     The canvas 2D rendering context
   * @param source  The media source: HTMLVideoElement | HTMLImageElement
   * @param clip    The clip object with all transform/filter properties
   * @param canvasW Canvas width (pixels)
   * @param canvasH Canvas height (pixels)
   */
  static drawClip(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLImageElement,
    clip: Clip,
    canvasW: number,
    canvasH: number
  ) {
    // ── Source dimensions ──────────────────────────────────────────────
    const srcW = source instanceof HTMLVideoElement
      ? (source.videoWidth || canvasW)
      : (source.naturalWidth || canvasW);
    const srcH = source instanceof HTMLVideoElement
      ? (source.videoHeight || canvasH)
      : (source.naturalHeight || canvasH);

    // ── Crop (as fraction of source dimensions) ────────────────────────
    const cropL  = ((clip.cropLeft   ?? 0) / 100) * srcW;
    const cropR  = ((clip.cropRight  ?? 0) / 100) * srcW;
    const cropT  = ((clip.cropTop    ?? 0) / 100) * srcH;
    const cropB  = ((clip.cropBottom ?? 0) / 100) * srcH;
    const cropSrcX = cropL;
    const cropSrcY = cropT;
    const cropSrcW = Math.max(1, srcW - cropL - cropR);
    const cropSrcH = Math.max(1, srcH - cropT - cropB);

    // ── Scale: default fills canvas maintaining aspect ratio ───────────
    const scaleX = (clip.scaleX ?? 100) / 100;
    const scaleY = (clip.scaleY ?? 100) / 100;

    // Base destination size = fill canvas at natural aspect, then apply user scale
    const baseW = canvasW * scaleX;
    const baseH = canvasH * scaleY;

    // ── Position: posX/posY as % offsets from center ───────────────────
    const posX = ((clip.posX ?? 0) / 100) * canvasW;
    const posY = ((clip.posY ?? 0) / 100) * canvasH;

    // Center of clip on canvas
    const cx = canvasW / 2 + posX;
    const cy = canvasH / 2 + posY;

    // ── Opacity & Blend Mode ──────────────────────────────────────────
    const opacity = (clip.opacity ?? 100) / 100;
    const blendModeMap: Record<string, GlobalCompositeOperation> = {
      'Normal':     'source-over',
      'Multiply':   'multiply',
      'Screen':     'screen',
      'Overlay':    'overlay',
      'Soft Light': 'soft-light',
    };
    const compositeOp: GlobalCompositeOperation =
      blendModeMap[clip.blendMode ?? 'Normal'] ?? 'source-over';

    // ── Build filter string ────────────────────────────────────────────
    const filterStr = clip.effects ? FilterEngine.buildFilterString(clip.effects as Effect[]) : 'none';

    ctx.save();

    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.globalCompositeOperation = compositeOp;
    ctx.filter = filterStr;

    // ── Apply transform ───────────────────────────────────────────────
    ctx.translate(cx, cy);
    if (clip.rotation) {
      ctx.rotate((clip.rotation * Math.PI) / 180);
    }

    try {
      ctx.drawImage(
        source,
        cropSrcX, cropSrcY, cropSrcW, cropSrcH,  // source rect (with crop)
        -baseW / 2, -baseH / 2, baseW, baseH       // dest rect (centered, scaled)
      );
    } catch {
      // Video not ready / cross-origin error — skip frame
    }

    // Draw vignette after video frame if applicable
    const vignetteEff = clip.effects?.find((e) => e.type === 'vignette' && e.enabled);
    if (vignetteEff) {
      ctx.filter = 'none';
      FilterEngine.drawVignette(ctx, baseW, baseH, vignetteEff.parameters?.intensity ?? 0.6);
    }

    ctx.restore();
  }

  /**
   * Legacy method — kept for backward compatibility.
   * Applies a filter stack to the context (without drawing).
   */
  static applyFilters(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    effects: Effect[]
  ) {
    const vignetteEffect = effects.find((e) => e.type === 'vignette' && e.enabled);
    ctx.filter = FilterEngine.buildFilterString(effects);
    if (vignetteEffect) {
      FilterEngine.drawVignette(ctx, width, height, vignetteEffect.parameters?.intensity ?? 0.6);
    }
  }
}
