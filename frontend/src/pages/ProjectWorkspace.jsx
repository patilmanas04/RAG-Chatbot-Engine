import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import API from "../api/axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PDFViewer from "../components/PDFViewer";

const ProjectWorkspace = () => {
  const { id } = useParams();

  // Documents State
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [docsLoading, setDocsLoading] = useState(true);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerQuote, setViewerQuote] = useState("");

  // Sidebar Upload State
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stagedFiles, setStagedFiles] = useState([]); 
  const [toast, setToast] = useState(null); 
  const fileInputRef = useRef(null);

  // Chat State
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [initialChatLoading, setInitialChatLoading] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const pollIntervals = useRef({});

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(pollIntervals.current).forEach(clearInterval);
    };
  }, []);

  // Poll for document ingestion status
  useEffect(() => {
    documents.forEach(doc => {
      // Check if document is currently processing
      const currentStatus = doc.status || doc.ingestion_status;
      const isProcessing = currentStatus && !['COMPLETED', 'FAILED'].includes(currentStatus);
      
      // If it is processing and we aren't already polling it, start an interval
      if (isProcessing && !pollIntervals.current[doc.id]) {
        pollIntervals.current[doc.id] = setInterval(async () => {
          try {
            const res = await API.get(`/projects/${id}/documents/${doc.id}/status`);
            const statusData = res.data.data || res.data; // Handle both wrapped and unwrapped payloads
            
            // Update the specific document in state
            setDocuments(prev => prev.map(d => 
              d.id === doc.id ? { ...d, ...statusData, status: statusData.ingestion_status } : d
            ));

            // Stop polling if completed or failed
            if (statusData.ingestion_status === 'COMPLETED' || statusData.ingestion_status === 'FAILED') {
              clearInterval(pollIntervals.current[doc.id]);
              delete pollIntervals.current[doc.id];
              fetchDocuments(); // Refresh the full list
            }
          } catch (err) {
            console.error(`Error polling status for doc ${doc.id}:`, err);
          }
        }, 2000);
      }
    });
  }, [documents, id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 150);
    }
  };

  useEffect(() => {
    // Only auto-scroll when a new message is added and we are already near the bottom,
    // or if the chat just loaded. For simplicity, auto-scroll when messages length changes.
    scrollToBottom();
  }, [messages.length, chatLoading]);

  // Fetch Documents
  const fetchDocuments = async () => {
    try {
      const response = await API.get(`/projects/${id}/documents`);
      setDocuments(response.data.data || []);
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch documents", "error");
    } finally {
      setDocsLoading(false);
    }
  };

  const fetchChatHistory = async () => {
    try {
      setInitialChatLoading(true);
      const response = await API.get(`/projects/${id}/chat`);
      if (response.data.data && Array.isArray(response.data.data)) {
        setMessages(response.data.data);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch chat history.", "error");
    } finally {
      setInitialChatLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchChatHistory();
  }, [id]);

  const handleSelectDocument = async (doc, pageNumber = 1, exactQuote = '') => {
    setViewerPage(pageNumber || 1);
    setViewerQuote(exactQuote || '');

    if (selectedDoc?.id === doc.id && pdfBlobUrl) {
      // If the same document is already loaded, just updating the page/quote states is enough
      return;
    }

    setSelectedDoc(doc);
    setPdfBlobUrl(null); // clear current viewer while loading
    try {
      const response = await API.get(`/projects/${id}/documents/${doc.id}/view`, {
        responseType: 'blob' 
      });
      const url = URL.createObjectURL(response.data);
      setPdfBlobUrl(url);
    } catch (err) {
      console.error(err);
      showToast("Failed to load PDF.", "error");
    }
  };

  const closeDocumentViewer = () => {
    setSelectedDoc(null);
    setPdfBlobUrl(null);
    setViewerPage(1);
    setViewerQuote("");
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
      if (newFiles.length !== e.dataTransfer.files.length) {
        showToast("Some files were skipped. Only PDFs are supported.", "error");
      }
      if (newFiles.length > 0) {
        setStagedFiles(prev => [...prev, ...newFiles]);
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).filter(f => f.type === "application/pdf");
      if (newFiles.length !== e.target.files.length) {
        showToast("Some files were skipped. Only PDFs are supported.", "error");
      }
      if (newFiles.length > 0) {
        setStagedFiles(prev => [...prev, ...newFiles]);
      }
    }
    e.target.value = null;
  };

  const removeStagedFile = (indexToRemove) => {
    setStagedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleBatchUpload = async () => {
    if (stagedFiles.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      stagedFiles.forEach(file => {
        formData.append("files", file);
      });
      
      await API.post(`/projects/${id}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      
      showToast(`${stagedFiles.length} document(s) uploaded and processed successfully!`, "success");
      setStagedFiles([]); 
      fetchDocuments(); 
    } catch (err) {
      console.error(err);
      showToast("Failed to upload documents. Please try again.", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || chatLoading) return;

    const userMessage = { role: "user", content: inputMessage.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setChatLoading(true);

    try {
      const response = await API.post(`/projects/${id}/chat`, {
        message: userMessage.content
      });
      const aiMessage = {
        role: "assistant",
        content: response.data.data?.content || "I couldn't generate an answer.",
        citations: response.data.data?.citations || []
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      console.error(err);
      const errorMessage = err.response?.data?.detail || "Sorry, I encountered an error. Please try again.";
      showToast("Failed to get response from AI.", "error");
      setMessages((prev) => [...prev, { role: "assistant", content: errorMessage }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-page via-page-alt to-page text-heading font-sans flex relative">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-5 duration-300 ${
          toast.type === "success" 
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500" 
            : "bg-red-500/10 border border-red-500/20 text-red-500"
        }`}>
          {toast.type === "success" ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Left Sidebar - 20% */}
      <aside className="w-[20%] shrink-0 border-r border-edge bg-surface flex flex-col h-full z-20 shadow-xl">
        <div className="px-5 py-5 border-b border-edge">
          <a href="/dashboard" id="link-back-dashboard" className="flex items-center gap-2 text-xs text-muted hover:text-violet-500 transition-colors mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Projects
          </a>
          <h2 className="text-sm font-bold tracking-tight truncate text-heading">Project #{id}</h2>
          <p className="text-xs text-muted mt-0.5">Knowledge Base</p>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3 border-b border-edge bg-page-alt/20">
          <input 
            type="file" 
            multiple
            accept="application/pdf" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
          />
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`w-full py-4 rounded-xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center gap-1.5 cursor-pointer group ${
              isDragging 
                ? "border-violet-500 bg-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.3)]" 
                : uploading
                ? "border-edge-strong bg-surface cursor-wait"
                : "border-edge-hover hover:border-violet-500/60 hover:bg-violet-500/10 bg-surface/50"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-6 h-6 mb-1 transition-all ${isDragging ? 'text-violet-500 animate-bounce' : 'text-muted group-hover:text-violet-500 group-hover:-translate-y-1'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div className="text-center">
              <span className="text-sm font-semibold text-heading group-hover:text-violet-500 transition-colors">
                Click to select
              </span>
              <span className="text-xs text-muted block mt-0.5">or drag and drop</span>
            </div>
          </div>

          {/* Staged Files List (Pre-Upload) */}
          {stagedFiles.length > 0 && (
            <div className="bg-surface border border-edge rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="px-3 py-2 border-b border-edge bg-page flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Ready to upload</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); setStagedFiles([]); }} 
                  className="text-[11px] text-red-500 hover:text-red-400 font-medium transition-colors cursor-pointer"
                  disabled={uploading}
                >
                  Clear all
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto p-1.5 space-y-0.5">
                {stagedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-surface-hover group">
                    <div className="flex items-center gap-2 truncate">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-heading truncate">{file.name}</span>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeStagedFile(idx); }} 
                      className="text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 cursor-pointer"
                      disabled={uploading}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-2 border-t border-edge bg-page">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleBatchUpload(); }} 
                  disabled={uploading} 
                  className="w-full py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {uploading ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Uploading & Processing...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Upload {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''} to LLM
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Document List (Server) */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">Knowledge Base</h3>
          {docsLoading ? (
            <div className="flex justify-center py-4">
              <span className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-xs text-faint text-center mt-4">No documents uploaded yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {documents.map((doc) => {
                const currentStatus = doc.status || doc.ingestion_status;
                const isProcessing = currentStatus && !['COMPLETED', 'FAILED'].includes(currentStatus);
                const isFailed = currentStatus === 'FAILED';
                const progressWidth = doc.progress || 0;

                return (
                <button
                  key={doc.id}
                  onClick={() => {
                    if (!isProcessing && !isFailed) {
                      handleSelectDocument(doc);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    isProcessing || isFailed ? "cursor-not-allowed opacity-75" : "cursor-pointer group hover:border-edge-strong hover:bg-surface-hover"
                  } border ${
                    selectedDoc?.id === doc.id
                      ? "bg-violet-500/10 border-violet-500/20"
                      : "bg-surface border-transparent"
                  }`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 transition-colors ${
                    selectedDoc?.id === doc.id 
                      ? "bg-red-500/20 text-red-500" 
                      : isFailed
                      ? "bg-red-500/10 text-red-500/50"
                      : "bg-page border border-edge text-red-500/70 group-hover:text-red-500"
                  }`}>
                    {/* Red PDF Icon or Spinner */}
                    {isProcessing ? (
                      <span className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className={`text-sm font-medium truncate transition-colors ${selectedDoc?.id === doc.id ? "text-violet-400" : isFailed ? "text-red-400" : "text-heading group-hover:text-violet-400"}`}>
                        {doc.file_name}
                      </p>
                      {isProcessing && (
                        <span className="text-[10px] font-bold text-violet-500">{progressWidth}%</span>
                      )}
                    </div>
                    {isProcessing ? (
                      <div className="w-full mt-1.5 flex flex-col gap-1">
                        <div className="w-full h-1 bg-edge rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full transition-all duration-300 ease-out" style={{ width: `${progressWidth}%` }}></div>
                        </div>
                        <p className="text-[10px] text-violet-400 truncate animate-pulse">
                          {doc.current_message || "Processing..."}
                        </p>
                      </div>
                    ) : isFailed ? (
                      <p className="text-[10px] text-red-500/80 truncate">
                        Ingestion Failed
                      </p>
                    ) : (
                      <p className="text-[10px] text-faint truncate">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </button>
              )})}
            </div>
          )}
        </div>
      </aside>

      {/* Middle Column (Chat Interface) - Dynamically expands to 80% if right panel is closed */}
      <main className={`${selectedDoc ? 'w-[40%]' : 'w-[80%]'} shrink-0 border-r border-edge flex flex-col h-full bg-page/50 transition-all duration-300 ease-in-out relative`}>
        <header className="border-b border-edge px-6 py-4 backdrop-blur-md bg-header flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-heading">AI Chat</h1>
              <p className="text-xs text-muted">Ask questions about your uploaded documents</p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-8" ref={chatContainerRef} onScroll={handleScroll}>
          {initialChatLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <span className="w-8 h-8 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              <p className="text-sm font-medium text-muted">Loading your conversation...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="max-w-2xl mx-auto flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-2xl bg-glow flex items-center justify-center mb-4 border border-violet-500/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-violet-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-heading/80 mb-1">Start a conversation</h3>
              <p className="text-sm text-muted max-w-sm">
                Upload documents to build your knowledge base, then ask anything. The AI will answer using your data.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 ${
                    msg.role === "user" 
                      ? "bg-surface border border-edge" 
                      : "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20"
                  }`}>
                    {msg.role === "user" ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    )}
                  </div>
                  <div className={`max-w-[80%] ${msg.role === "user" ? "bg-surface border border-edge rounded-2xl rounded-tr-sm px-5 py-3 shadow-sm" : ""}`}>
                    {msg.role === "user" ? (
                      <p className="text-sm text-heading leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="flex flex-col">
                        <div className="prose dark:prose-invert prose-sm max-w-none text-heading leading-relaxed prose-p:my-2 first:prose-p:mt-0 last:prose-p:mb-0 prose-a:text-violet-400 prose-strong:text-heading">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-edge-strong">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Citations</p>
                            <div className="flex flex-wrap gap-2">
                            {msg.citations.map((cit, cIdx) => {
                              const relatedDoc = documents.find(d => d.file_name === cit.source_file);
                              return (
                                <button 
                                  key={cIdx} 
                                  onClick={() => relatedDoc && handleSelectDocument(relatedDoc, cit.page_number, cit.exact_quote)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-edge hover:border-violet-500/40 hover:bg-violet-500/5 transition-all text-xs text-muted hover:text-violet-400 cursor-pointer shadow-sm"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  {cit.source_file} <span className="text-faint ml-0.5">(p. {cit.page_number})</span>
                                </button>
                              );
                            })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Loading Indicator */}
              {chatLoading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20 flex items-center justify-center shrink-0 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-1.5 h-8">
                    <span className="w-2 h-2 rounded-full bg-violet-500/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-violet-500/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-violet-500/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <button 
            onClick={scrollToBottom}
            className="absolute bottom-28 right-1/2 translate-x-1/2 w-10 h-10 bg-page border border-edge-strong rounded-full flex items-center justify-center shadow-xl hover:scale-105 text-heading transition-all z-50 cursor-pointer animate-in fade-in zoom-in duration-200"
            aria-label="Scroll to bottom"
          >
            <div className="flex items-center justify-center w-full h-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-violet-500 translate-y-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </button>
        )}

        <div className="border-t border-edge px-6 py-4 bg-surface/80 backdrop-blur-md relative z-10">
          {(() => {
            const hasProcessingDocs = documents.some(doc => {
              const currentStatus = doc.status || doc.ingestion_status;
              return currentStatus && !['COMPLETED', 'FAILED'].includes(currentStatus);
            });
            const hasCompletedDocs = documents.some(doc => {
              const currentStatus = doc.status || doc.ingestion_status;
              return currentStatus === 'COMPLETED';
            });
            const isChatDisabled = chatLoading || uploading || docsLoading || hasProcessingDocs || !hasCompletedDocs;
            
            const getPlaceholder = () => {
              if (documents.length === 0 && !docsLoading) return "Upload documents to start chatting...";
              if (hasProcessingDocs || uploading) return "Please wait for documents to finish processing...";
              if (!hasCompletedDocs) return "No successful documents to chat with.";
              return "Ask a question about your documents...";
            };

            if (documents.length === 0 && !docsLoading) {
              return (
                <div className="max-w-3xl mx-auto flex items-center justify-center py-3 px-4 bg-input/50 border border-edge-strong rounded-xl text-muted text-sm shadow-sm cursor-not-allowed">
                  Upload documents to the knowledge base to start chatting.
                </div>
              );
            }

            return (
              <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex items-center gap-3 relative">
                <input
                  id="input-chat-message"
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={isChatDisabled}
                  placeholder={getPlaceholder()}
                  className="flex-1 bg-input border border-edge-strong rounded-xl px-4 py-3 text-sm text-heading placeholder-muted focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all disabled:opacity-50 shadow-sm"
                  autoComplete="off"
                />
                <button
                  id="btn-send-message"
                  type="submit"
                  disabled={!inputMessage.trim() || isChatDisabled}
                  className="px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            );
          })()}
          <div className="text-center mt-2">
            <p className="text-[10px] text-faint">AI can make mistakes. Verify important information using the citations.</p>
          </div>
        </div>
      </main>

      {/* Right Column (PDF Viewer / Citation Area) - Conditional 40% */}
      {selectedDoc && (
        <section className="w-[40%] shrink-0 bg-surface flex flex-col h-full relative border-l border-edge animate-in slide-in-from-right-8 duration-300">
          <header className="border-b border-edge px-6 py-4 backdrop-blur-md bg-header flex items-center justify-between shadow-sm z-10">
            <div className="flex-1 truncate pr-4">
              <h2 className="text-sm font-semibold text-heading truncate">{selectedDoc.file_name}</h2>
              <p className="text-xs text-muted">Document Viewer</p>
            </div>
            <button 
              onClick={closeDocumentViewer}
              className="w-8 h-8 rounded-lg hover:bg-surface-hover flex items-center justify-center text-muted hover:text-heading transition-colors cursor-pointer"
              title="Close viewer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div className="flex-1 relative bg-[#525659] flex items-center justify-center overflow-hidden">
            {pdfBlobUrl ? (
              <PDFViewer fileUrl={pdfBlobUrl} pageNumber={viewerPage} exactQuote={viewerQuote} />
            ) : (
              <div className="flex flex-col items-center gap-3">
                <span className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="text-sm text-white/80 font-medium">Downloading PDF securely...</span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProjectWorkspace;
