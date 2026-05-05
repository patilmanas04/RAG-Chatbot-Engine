import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import API from "../api/axios";
import ThemeToggle from "../components/ThemeToggle";

const Dashboard = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await API.get("/projects/");
      setProjects(response.data.data || []);
    } catch {
      setError("Failed to load projects. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    setCreateError("");
    if (!newProjectName.trim()) { setCreateError("Project name is required."); return; }
    setCreating(true);
    try {
      await API.post("/projects/", { name: newProjectName.trim(), description: newProjectDesc.trim() || null });
      setShowModal(false);
      setNewProjectName("");
      setNewProjectDesc("");
      fetchProjects();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setCreateError(typeof detail === "string" ? detail : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const accentColors = [
    "from-violet-500 to-indigo-600",
    "from-cyan-500 to-blue-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-fuchsia-500 to-purple-600",
  ];
  const accentShadows = [
    "shadow-violet-500/15", "shadow-cyan-500/15", "shadow-emerald-500/15",
    "shadow-amber-500/15", "shadow-rose-500/15", "shadow-fuchsia-500/15",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-page via-page-alt to-page text-heading font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-edge backdrop-blur-xl bg-header">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h1 className="text-lg font-bold tracking-tight text-heading">RAG Workspace</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              id="btn-logout"
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-body hover:text-heading transition-colors cursor-pointer px-3 py-1.5 rounded-lg hover:bg-surface-hover"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-xs text-violet-500 font-semibold tracking-widest uppercase mb-2">Overview</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-heading">Your Projects</h2>
            <p className="text-body mt-1.5 text-sm max-w-md">
              Manage your RAG knowledge bases. Upload documents, build context, and chat with AI.
            </p>
          </div>
          <button
            id="btn-new-project"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 px-5 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {error}
            <button onClick={fetchProjects} className="ml-auto text-red-400 hover:text-heading text-xs font-medium underline cursor-pointer">Retry</button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface border border-edge rounded-2xl p-6 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-skeleton" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-skeleton rounded-lg w-3/4" />
                    <div className="h-3 bg-skeleton rounded-lg w-1/2" />
                  </div>
                </div>
                <div className="h-3 bg-skeleton rounded-lg w-full mb-2" />
                <div className="h-3 bg-skeleton rounded-lg w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="border border-dashed border-edge-hover rounded-2xl p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-glow flex items-center justify-center mb-5 border border-violet-500/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-violet-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-heading mb-1">No projects yet</h3>
            <p className="text-sm text-muted max-w-sm mb-6">
              Create your first project to start uploading documents and chatting with your AI knowledge base.
            </p>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 transition-all cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create your first project
            </button>
          </div>
        )}

        {/* Project cards */}
        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <button
                key={project.id}
                id={`project-card-${project.id}`}
                onClick={() => navigate(`/project/${project.id}`)}
                className={`group text-left bg-surface hover:bg-surface-hover border border-edge-strong hover:border-edge-hover rounded-2xl p-6 transition-all duration-300 cursor-pointer hover:shadow-xl ${accentShadows[project.id % accentShadows.length]} hover:-translate-y-0.5`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${accentColors[project.id % accentColors.length]} flex items-center justify-center shadow-md shrink-0`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-heading truncate group-hover:text-violet-500 transition-colors">{project.name}</h3>
                      <p className="text-xs text-muted mt-0.5">ID: {project.id}</p>
                    </div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-faint group-hover:text-body group-hover:translate-x-0.5 transition-all shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                {project.description && (
                  <p className="text-xs text-body line-clamp-2 mb-4 leading-relaxed">{project.description}</p>
                )}
                <div className="flex items-center gap-2 pt-3 border-t border-edge">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs text-muted">{formatDate(project.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-backdrop backdrop-blur-sm" onClick={() => { setShowModal(false); setCreateError(""); }} />
          <div className="relative w-full max-w-md bg-modal backdrop-blur-xl border border-edge-strong rounded-2xl p-8 shadow-2xl">
            <button id="btn-close-modal" onClick={() => { setShowModal(false); setCreateError(""); }} className="absolute top-4 right-4 text-muted hover:text-heading transition-colors cursor-pointer p-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-heading">New Project</h2>
                <p className="text-xs text-body">Create a new RAG knowledge base</p>
              </div>
            </div>
            {createError && (
              <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">{createError}</div>
            )}
            <form onSubmit={handleCreateProject} className="space-y-5">
              <div>
                <label htmlFor="input-project-name" className="block text-sm font-medium text-body mb-1.5">
                  Project name <span className="text-red-500">*</span>
                </label>
                <input id="input-project-name" type="text" required autoFocus value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="e.g. Company Policy Docs"
                  className="w-full bg-input border border-edge-strong rounded-xl px-4 py-3 text-sm text-heading placeholder-muted focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all" />
              </div>
              <div>
                <label htmlFor="input-project-description" className="block text-sm font-medium text-body mb-1.5">
                  Description <span className="text-faint">(optional)</span>
                </label>
                <textarea id="input-project-description" value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)} placeholder="What documents will this project contain?" rows={3}
                  className="w-full bg-input border border-edge-strong rounded-xl px-4 py-3 text-sm text-heading placeholder-muted focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all resize-none" />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setCreateError(""); }} className="flex-1 py-3 rounded-xl border border-edge-strong text-sm font-medium text-body hover:bg-surface-hover transition-all cursor-pointer">Cancel</button>
                <button id="btn-confirm-create-project" type="submit" disabled={creating} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  {creating ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
