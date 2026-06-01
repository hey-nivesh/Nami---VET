import { useState } from 'react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useTimelineStore } from '../store/timelineStore';
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const { getSelectedClip, selectedClipId } = useTimelineStore();
  const selectedClip = getSelectedClip();

  const [sections, setSections] = useState({
    compositing: true,
    transform: true,
    crop: false,
  });

  const [values, setValues] = useState({
    opacity: 100,
    blendMode: 'Normal',
    posX: 0,
    posY: 0,
    scaleX: 100,
    scaleY: 100,
    rotation: 0,
    cropLeft: 0,
    cropRight: 0,
    cropTop: 0,
    cropBottom: 0,
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  };

  const updateValue = (key: string, val: number | string) => {
    setValues((v) => ({ ...v, [key]: val }));
  };

  if (!selectedClipId || !selectedClip) {
    return (
      <div className="properties-panel">
        <div className="properties-empty">
          <p>Select a clip to view properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="properties-panel">
      {/* Clip info */}
      <div className="properties-clip-info">
        <span className="properties-clip-name">{selectedClip.fileName}</span>
        <span className="properties-clip-type">{selectedClip.type}</span>
      </div>

      {/* Compositing */}
      <div className="properties-section">
        <button className="properties-section-header" onClick={() => toggleSection('compositing')}>
          <div className="properties-section-toggle">
            {sections.compositing ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <span>Compositing</span>
          </div>
          <input type="checkbox" className="properties-checkbox" defaultChecked />
        </button>
        {sections.compositing && (
          <div className="properties-section-body">
            <PropertyRow label="Opacity" value={values.opacity} suffix="%" min={0} max={100}
              onChange={(v) => updateValue('opacity', v)} />
            <div className="property-row">
              <label className="property-label">Blend Mode</label>
              <select className="property-select" value={values.blendMode}
                onChange={(e) => updateValue('blendMode', e.target.value)}>
                <option>Normal</option>
                <option>Multiply</option>
                <option>Screen</option>
                <option>Overlay</option>
                <option>Soft Light</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Transform */}
      <div className="properties-section">
        <button className="properties-section-header" onClick={() => toggleSection('transform')}>
          <div className="properties-section-toggle">
            {sections.transform ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <span>Transform</span>
          </div>
          <input type="checkbox" className="properties-checkbox" defaultChecked />
        </button>
        {sections.transform && (
          <div className="properties-section-body">
            <PropertyRow label="Position X" value={values.posX} min={-1920} max={1920}
              onChange={(v) => updateValue('posX', v)} />
            <PropertyRow label="Position Y" value={values.posY} min={-1080} max={1080}
              onChange={(v) => updateValue('posY', v)} />
            <PropertyRow label="Scale X" value={values.scaleX} suffix="%" min={0} max={500}
              onChange={(v) => updateValue('scaleX', v)} />
            <PropertyRow label="Scale Y" value={values.scaleY} suffix="%" min={0} max={500}
              onChange={(v) => updateValue('scaleY', v)} />
            <PropertyRow label="Rotation" value={values.rotation} suffix="°" min={-360} max={360}
              onChange={(v) => updateValue('rotation', v)} />
          </div>
        )}
      </div>

      {/* Crop */}
      <div className="properties-section">
        <button className="properties-section-header" onClick={() => toggleSection('crop')}>
          <div className="properties-section-toggle">
            {sections.crop ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <span>Crop</span>
          </div>
          <input type="checkbox" className="properties-checkbox" />
        </button>
        {sections.crop && (
          <div className="properties-section-body">
            <PropertyRow label="Left" value={values.cropLeft} min={0} max={100}
              onChange={(v) => updateValue('cropLeft', v)} />
            <PropertyRow label="Right" value={values.cropRight} min={0} max={100}
              onChange={(v) => updateValue('cropRight', v)} />
            <PropertyRow label="Top" value={values.cropTop} min={0} max={100}
              onChange={(v) => updateValue('cropTop', v)} />
            <PropertyRow label="Bottom" value={values.cropBottom} min={0} max={100}
              onChange={(v) => updateValue('cropBottom', v)} />
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyRow({
  label,
  value,
  suffix = '',
  min = 0,
  max = 100,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
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
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          className="property-number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="property-suffix">{suffix}</span>}
      </div>
    </div>
  );
}
