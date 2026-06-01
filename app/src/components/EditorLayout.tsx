import { useState, useEffect } from 'react';
import TopBar from './TopBar';
import MediaBin from './MediaBin';
import AIToolsPanel from './AIToolsPanel';
import VideoPreview from './VideoPreview';
import PropertiesPanel from './PropertiesPanel';
import AIChatPanel from './AIChatPanel';
import Timeline from './Timeline';
import { useProjectStore } from '../store/projectStore';
import { useMediaStore } from '../store/mediaStore';
import { useAIStore } from '../store/aiStore';
import './EditorLayout.css';

export default function EditorLayout() {
  const { currentProject } = useProjectStore();
  const { loadAssets } = useMediaStore();
  const [rightTab, setRightTab] = useState<'properties' | 'ai'>('properties');

  const projectId = currentProject?.id || '';

  useEffect(() => {
    if (projectId) {
      loadAssets(projectId);
      
      // Subscribe to WebSocket real-time changes
      const unsubscribe = useAIStore.getState().subscribeToSync(projectId);
      return () => unsubscribe();
    }
  }, [projectId, loadAssets]);

  return (
    <div className="editor-layout">
      <TopBar />

      <div className="editor-main">
        {/* Left Panel — Media Bin + AI Tools */}
        <div className="editor-left panel">
          <MediaBin projectId={projectId} />
          <AIToolsPanel onOpenChat={() => setRightTab('ai')} />
        </div>

        {/* Center — Video Preview */}
        <div className="editor-center">
          <VideoPreview />
        </div>

        {/* Right Panel — Properties / AI Chat */}
        <div className="editor-right panel">
          <div className="editor-right-tabs">
            <button
              className={`editor-tab ${rightTab === 'properties' ? 'active' : ''}`}
              onClick={() => setRightTab('properties')}
            >
              Properties
            </button>
            <button
              className={`editor-tab ${rightTab === 'ai' ? 'active' : ''}`}
              onClick={() => setRightTab('ai')}
            >
              AI Assistant
            </button>
          </div>
          <div className="editor-right-content">
            {rightTab === 'properties' ? <PropertiesPanel /> : <AIChatPanel />}
          </div>
        </div>
      </div>

      <Timeline />
    </div>
  );
}
