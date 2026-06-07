import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconChevronRight, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import { useTimelineStore } from '../store/timelineStore';
import './PropertiesPanel.css';

const BLEND_MODES = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Soft Light'];

export default function PropertiesPanel() {
  const {
    getSelectedClip,
    selectedClipId,
    updateClip,
    pushUndo,
    sendClipForward,
    sendClipBackward,
  } = useTimelineStore();

  const selectedClip = getSelectedClip();

  const [sections, setSections] = useState({
    compositing: true,
    transform: true,
    crop: false,
  });

  // ── Local state mirrors clip fields ───────────────────────────────────────
  const [values, setValues] = useState({
    opacity:    100,
    blendMode:  'Normal',
    posX:       0,
    posY:       0,
    scaleX:     100,
    scaleY:     100,
    rotation:   0,
    cropLeft:   0,
    cropRight:  0,
    cropTop:    0,
    cropBottom: 0,
  });

  // Debounce undo to avoid flooding history when dragging a slider
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedUndo = (label: string) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => pushUndo(label), 300);
  };

  // ── Sync values FROM clip when selection changes ──────────────────────────
  useEffect(() => {
    if (!selectedClip) return;
    setValues({
      opacity:    selectedClip.opacity    ?? 100,
      blendMode:  selectedClip.blendMode  ?? 'Normal',
      posX:       selectedClip.posX       ?? 0,
      posY:       selectedClip.posY       ?? 0,
      scaleX:     selectedClip.scaleX     ?? 100,
      scaleY:     selectedClip.scaleY     ?? 100,
      rotation:   selectedClip.rotation   ?? 0,
      cropLeft:   selectedClip.cropLeft   ?? 0,
      cropRight:  selectedClip.cropRight  ?? 0,
      cropTop:    selectedClip.cropTop    ?? 0,
      cropBottom: selectedClip.cropBottom ?? 0,
    });
  }, [selectedClipId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Write change to store immediately (canvas updates in real-time) ───────
  const handleChange = (key: string, val: number | string) => {
    setValues((v) => ({ ...v, [key]: val }));
    if (selectedClipId) {
      updateClip(selectedClipId, { [key]: val });
      debouncedUndo(`Changed ${key}`);
    }
  };

  const toggleSection = (key: keyof typeof sections) =>
    setSections((s) => ({ ...s, [key]: !s[key] }));

  if (!selectedClipId || !selectedClip) {
    return (
      <div className="properties-panel">
        <div className="properties-empty">
          <p>Select a clip to edit properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="properties-panel">
      {/* Clip info + layer order */}
      <div className="properties-clip-info">
        <div>
          <span className="properties-clip-name">{selectedClip.fileName}</span>
          <span className="properties-clip-type">{selectedClip.type}</span>
        </div>
        <div className="properties-layer-btns" title="Layer Order">
          <button
            className="btn-icon"
            title="Send Forward (render on top)"
            onClick={() => sendClipForward(selectedClipId)}
          >
            <IconArrowUp size={14} />
          </button>
          <button
            className="btn-icon"
            title="Send Backward (render behind)"
            onClick={() => sendClipBackward(selectedClipId)}
          >
            <IconArrowDown size={14} />
          </button>
        </div>
      </div>

      {/* ── Compositing ──────────────────────────────────────────────────── */}
      <div className="properties-section">
        <button className="properties-section-header" onClick={() => toggleSection('compositing')}>
          <div className="properties-section-toggle">
            {sections.compositing ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <span>Compositing</span>
          </div>
        </button>
        {sections.compositing && (
          <div className="properties-section-body">
            <PropertyRow
              label="Opacity"
              value={values.opacity}
              suffix="%"
              min={0}
              max={100}
              step={1}
              onChange={(v) => handleChange('opacity', v)}
            />
            <div className="property-row">
              <label className="property-label">Blend Mode</label>
              <select
                className="property-select"
                value={values.blendMode}
                onChange={(e) => handleChange('blendMode', e.target.value)}
              >
                {BLEND_MODES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Transform ────────────────────────────────────────────────────── */}
      <div className="properties-section">
        <button className="properties-section-header" onClick={() => toggleSection('transform')}>
          <div className="properties-section-toggle">
            {sections.transform ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <span>Transform</span>
          </div>
        </button>
        {sections.transform && (
          <div className="properties-section-body">
            <PropertyRow label="Position X" value={values.posX} min={-100} max={100} step={0.5}
              onChange={(v) => handleChange('posX', v)} />
            <PropertyRow label="Position Y" value={values.posY} min={-100} max={100} step={0.5}
              onChange={(v) => handleChange('posY', v)} />
            <PropertyRow label="Scale X" value={values.scaleX} suffix="%" min={10} max={300} step={1}
              onChange={(v) => handleChange('scaleX', v)} />
            <PropertyRow label="Scale Y" value={values.scaleY} suffix="%" min={10} max={300} step={1}
              onChange={(v) => handleChange('scaleY', v)} />
            <PropertyRow label="Rotation" value={values.rotation} suffix="°" min={-180} max={180} step={1}
              onChange={(v) => handleChange('rotation', v)} />
          </div>
        )}
      </div>

      {/* ── Crop ─────────────────────────────────────────────────────────── */}
      <div className="properties-section">
        <button className="properties-section-header" onClick={() => toggleSection('crop')}>
          <div className="properties-section-toggle">
            {sections.crop ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <span>Crop</span>
          </div>
        </button>
        {sections.crop && (
          <div className="properties-section-body">
            <PropertyRow label="Left"   value={values.cropLeft}   suffix="%" min={0} max={50}
              onChange={(v) => handleChange('cropLeft', v)} />
            <PropertyRow label="Right"  value={values.cropRight}  suffix="%" min={0} max={50}
              onChange={(v) => handleChange('cropRight', v)} />
            <PropertyRow label="Top"    value={values.cropTop}    suffix="%" min={0} max={50}
              onChange={(v) => handleChange('cropTop', v)} />
            <PropertyRow label="Bottom" value={values.cropBottom} suffix="%" min={0} max={50}
              onChange={(v) => handleChange('cropBottom', v)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── PropertyRow ───────────────────────────────────────────────────────────────

function PropertyRow({
  label,
  value,
  suffix = '',
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="property-row">
      <label className="property-label">{label}</label>
      <div className="property-control">
        <input
          type="range"
          className="slider property-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          className="property-number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="property-suffix">{suffix}</span>}
      </div>
    </div>
  );
}
