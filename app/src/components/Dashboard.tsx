import { useState, useEffect } from 'react';
import {
  IconPlus,
  IconMovie,
  IconSearch,
  IconClock,
  IconCalendar,
  IconTrash,
  IconCopy,
  IconEdit,
  IconLogout,
} from '@tabler/icons-react';
import { useProjectStore, type Project } from '../store/projectStore';
import { useAuthStore } from '../store/authStore';
import './Dashboard.css';

export default function Dashboard() {
  const {
    projects,
    loadProjects,
    createProject,
    openProject,
    deleteProject,
    renameProject,
    saveProject,
  } = useProjectStore();
  const { signOut, user } = useAuthStore();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'modified' | 'name' | 'duration'>('modified');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async () => {
    const name = `Untitled Project ${projects.length + 1}`;
    const p = await createProject(name);
    if (p) {
      await openProject(p.id);
    }
  };

  const handleRename = (project: Project) => {
    setEditingProjectId(project.id);
    setEditName(project.name);
  };

  const handleSaveRename = async (project: Project) => {
    if (editName.trim() && editName.trim() !== project.name) {
      // Temporarily open store mutation for rename then save
      useProjectStore.setState({ currentProject: project });
      renameProject(editName.trim());
      await saveProject();
      useProjectStore.setState({ currentProject: null });
      await loadProjects();
    }
    setEditingProjectId(null);
  };

  const handleDuplicate = async (project: Project) => {
    const newName = `${project.name} (Copy)`;
    const newProj = await createProject(newName);
    if (newProj) {
      // In a full DB implementation we would duplicate project timeline and media asset rows
      console.log(`[Dashboard] Duplicated project: ${project.id} into ${newProj.id}`);
      await loadProjects();
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Filter and sort projects
  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'duration') {
      return b.duration_seconds - a.duration_seconds;
    }
    // Default last modified
    return new Date(b.last_opened_at).getTime() - new Date(a.last_opened_at).getTime();
  });

  const avatarLetter = user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="dashboard-container">
      {/* Navbar */}
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <div className="dashboard-logo">
            <IconMovie size={24} stroke={1.5} color="#FF8C00" />
            <span className="dashboard-logo-text">Nami</span>
          </div>
        </div>
        
        <div className="dashboard-header-right">
          <span className="dashboard-user-email text-muted">{user?.email}</span>
          <button className="btn-icon" onClick={() => signOut()} title="Sign Out">
            <IconLogout size={18} stroke={1.5} />
          </button>
          <div className="dashboard-avatar">{avatarLetter}</div>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="dashboard-banner">
        <h2>Your Video Projects</h2>
        <p className="text-muted">Create a new project or select an existing one to start editing.</p>
      </div>

      {/* Toolbar */}
      <div className="dashboard-toolbar">
        <div className="dashboard-search-wrapper">
          <IconSearch size={16} className="search-icon" />
          <input
            className="dashboard-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
          />
        </div>

        <div className="dashboard-sorting">
          <span className="text-muted text-xs">Sort by:</span>
          <button
            className={`sort-btn ${sortBy === 'modified' ? 'active' : ''}`}
            onClick={() => setSortBy('modified')}
          >
            Last Modified
          </button>
          <button
            className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
            onClick={() => setSortBy('name')}
          >
            Name
          </button>
          <button
            className={`sort-btn ${sortBy === 'duration' ? 'active' : ''}`}
            onClick={() => setSortBy('duration')}
          >
            Duration
          </button>
        </div>
      </div>

      {/* Project Grid */}
      <div className="dashboard-grid">
        {/* New Project Card */}
        <div className="project-card new-project-card" onClick={handleCreateProject}>
          <div className="new-project-icon">
            <IconPlus size={32} stroke={1.5} />
          </div>
          <span className="new-project-label">New Project</span>
        </div>

        {/* Project Cards */}
        {sortedProjects.map((project) => (
          <div key={project.id} className="project-card">
            {/* Thumbnail Placeholder */}
            <div className="project-card-thumbnail" onClick={() => openProject(project.id)}>
              <div className="project-thumbnail-overlay">
                <IconMovie size={48} stroke={0.8} className="project-film-icon" />
              </div>
              <span className="badge resolution-badge">{project.resolution}</span>
            </div>

            {/* Content info */}
            <div className="project-card-info">
              {editingProjectId === project.id ? (
                <input
                  className="project-name-edit-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleSaveRename(project)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(project)}
                  autoFocus
                />
              ) : (
                <h4 className="project-name" onClick={() => openProject(project.id)}>
                  {project.name}
                </h4>
              )}

              <div className="project-metadata">
                <span className="metadata-item">
                  <IconCalendar size={12} />
                  <span>{formatDate(project.last_opened_at)}</span>
                </span>
                <span className="metadata-item">
                  <IconClock size={12} />
                  <span>{formatDuration(project.duration_seconds)}</span>
                </span>
              </div>

              {/* Actions row */}
              <div className="project-card-actions">
                <button
                  className="card-action-btn"
                  onClick={() => handleRename(project)}
                  title="Rename Project"
                >
                  <IconEdit size={14} />
                </button>
                <button
                  className="card-action-btn"
                  onClick={() => handleDuplicate(project)}
                  title="Duplicate Project"
                >
                  <IconCopy size={14} />
                </button>
                <button
                  className="card-action-btn delete-btn"
                  onClick={() => deleteProject(project.id)}
                  title="Delete Project"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
