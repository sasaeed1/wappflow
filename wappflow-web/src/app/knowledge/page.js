'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain, Upload, FileText, Trash2, Plus, X, Edit2, Save,
  ChevronDown, ChevronUp, RefreshCw, CheckCircle, AlertCircle,
  BookOpen, Sparkles, Database, File, MessageSquare, Tag
} from 'lucide-react';
import NavBar from '../../components/NavBar';
import { useConfirm } from '@/lib/confirm';

const API = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
const authHeader = () => ({
  Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}`
});

const MEMORY_TYPES = [
  { value: 'pricing', label: 'Pricing', color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
  { value: 'service', label: 'Service', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  { value: 'course', label: 'Course', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  { value: 'product', label: 'Product', color: '#06b6d4', bg: 'rgba(6,182,212,0.10)' },
  { value: 'policy', label: 'Policy', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { value: 'schedule', label: 'Schedule', color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)' },
  { value: 'contact', label: 'Contact', color: '#f97316', bg: 'rgba(249,115,22,0.10)' },
  { value: 'faq', label: 'FAQ', color: '#84cc16', bg: '#f7fee7' },
  { value: 'other', label: 'Other', color: 'var(--text-dim)', bg: 'var(--surface2)' },
];

function getTypeInfo(type) {
  return MEMORY_TYPES.find(t => t.value === type) || MEMORY_TYPES[MEMORY_TYPES.length - 1];
}

function Toast({ message, type }) {
  return (
    <div style={{
      position: 'fixed', top: 20, right: 24, zIndex: 9999,
      background: type === 'error' ? '#ef4444' : '#111827',
      color: 'white', padding: '13px 20px', borderRadius: 14, fontSize: 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      animation: 'slideIn 0.3s ease'
    }}>
      {type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} color="#10b981" />}
      {message}
    </div>
  );
}

export default function KnowledgePage() {
  const router = useRouter();
  const confirm = useConfirm();
  const fileInputRef = useRef();

  const [documents, setDocuments] = useState([]);
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [learning, setLearning] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('documents');
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [docMemories, setDocMemories] = useState({});

  // Memory form
  const [showMemoryForm, setShowMemoryForm] = useState(false);
  const [editingMemory, setEditingMemory] = useState(null);
  const [memoryForm, setMemoryForm] = useState({ memory_type: 'pricing', key: '', value: '', confidence: 90 });
  const [savingMemory, setSavingMemory] = useState(false);

  // Filter
  const [filterType, setFilterType] = useState('all');
  const [searchQ, setSearchQ] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/login'); return; }
    fetchAll();
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [docsRes, memsRes] = await Promise.all([
        fetch(`${API}/api/knowledge`, { headers: authHeader() }),
        fetch(`${API}/api/memories`, { headers: authHeader() }),
      ]);
      const docsData = await docsRes.json();
      const memsData = await memsRes.json();
      setDocuments(docsData.documents || []);
      setMemories(memsData.memories || []);
    } catch (e) { showToast('Failed to load data', 'error'); }
    finally { setLoading(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/api/knowledge/upload`, {
        method: 'POST',
        headers: authHeader(),
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('File uploaded! AI is extracting knowledge in background...');
      setTimeout(fetchAll, 3000); // Refresh after 3s to show processing result
      setTimeout(fetchAll, 8000); // Refresh again after 8s
    } catch (e) { showToast(e.message || 'Upload failed', 'error'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDeleteDoc = async (id) => {
    const ok = await confirm({ title: 'Delete document?', message: 'This will also remove every memory extracted from it. This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try {
      await fetch(`${API}/api/knowledge/${id}`, { method: 'DELETE', headers: authHeader() });
      showToast('Document deleted');
      fetchAll();
    } catch { showToast('Delete failed', 'error'); }
  };

  const handleLearnFromMessages = async () => {
    setLearning(true);
    try {
      const res = await fetch(`${API}/api/knowledge/learn-from-messages`, { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(data.message);
      fetchAll();
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
    finally { setLearning(false); }
  };

  const handleExpandDoc = async (docId) => {
    if (expandedDoc === docId) { setExpandedDoc(null); return; }
    setExpandedDoc(docId);
    if (!docMemories[docId]) {
      try {
        const res = await fetch(`${API}/api/knowledge/${docId}/memories`, { headers: authHeader() });
        const data = await res.json();
        setDocMemories(p => ({ ...p, [docId]: data.memories || [] }));
      } catch {}
    }
  };

  const handleSaveMemory = async () => {
    if (!memoryForm.key.trim() || !memoryForm.value.trim()) return;
    setSavingMemory(true);
    try {
      const url = editingMemory ? `${API}/api/memories/${editingMemory.id}` : `${API}/api/memories`;
      const method = editingMemory ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(memoryForm),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast(editingMemory ? 'Memory updated!' : 'Memory added!');
      setShowMemoryForm(false);
      setEditingMemory(null);
      setMemoryForm({ memory_type: 'pricing', key: '', value: '', confidence: 90 });
      fetchAll();
    } catch (e) { showToast(e.message || 'Save failed', 'error'); }
    finally { setSavingMemory(false); }
  };

  const handleDeleteMemory = async (id) => {
    const ok = await confirm({ title: 'Delete memory?', message: 'The AI will no longer use this fact in suggested replies.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try {
      await fetch(`${API}/api/memories/${id}`, { method: 'DELETE', headers: authHeader() });
      showToast('Memory deleted');
      fetchAll();
    } catch { showToast('Delete failed', 'error'); }
  };

  const openEditMemory = (m) => {
    setEditingMemory(m);
    setMemoryForm({ memory_type: m.memory_type, key: m.key, value: m.value, confidence: m.confidence });
    setShowMemoryForm(true);
  };

  const filteredMemories = memories.filter(m => {
    if (filterType !== 'all' && m.memory_type !== filterType) return false;
    if (searchQ && !m.key.toLowerCase().includes(searchQ.toLowerCase()) && !m.value.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const groupedMemories = MEMORY_TYPES.reduce((acc, t) => {
    const group = filteredMemories.filter(m => m.memory_type === t.value);
    if (group.length > 0) acc[t.value] = group;
    return acc;
  }, {});

  return (
    <NavBar>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <style>{`
          @keyframes slideIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        `}</style>

        {toast && <Toast message={toast.msg} type={toast.type} />}

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Brain size={26} color="white" />
              </div>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Knowledge Base</h1>
                <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Teach your AI about your business — it learns and remembers</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleLearnFromMessages} disabled={learning} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
                borderRadius: 12, border: '1.5px solid #c4b5fd', background: 'rgba(139,92,246,0.10)',
                color: '#7c3aed', fontWeight: 700, cursor: learning ? 'not-allowed' : 'pointer', fontSize: 13
              }}>
                {learning ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <MessageSquare size={14} />}
                {learning ? 'Learning...' : 'Learn from Chats'}
              </button>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload}
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
                borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                color: 'white', fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13,
                boxShadow: '0 4px 14px rgba(139,92,246,0.35)'
              }}>
                {uploading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
                {uploading ? 'Uploading...' : 'Upload Document'}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Documents', value: documents.length, icon: FileText, color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
              { label: 'Memories', value: memories.length, icon: Database, color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)' },
              { label: 'Auto-Learned', value: memories.filter(m => m.source !== 'manual').length, icon: Sparkles, color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface)', borderRadius: 16, padding: '18px 20px', border: '1.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.icon size={20} color={s.color} />
                </div>
                <div>
                  <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{s.value}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0, marginTop: 3 }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 14, padding: 5, border: '1.5px solid #e5e7eb', marginBottom: 20, width: 'fit-content' }}>
            {[
              { id: 'documents', label: 'Documents', icon: FileText },
              { id: 'memories', label: 'All Memories', icon: Database },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, border: 'none',
                background: activeTab === tab.id ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#6b7280',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s'
              }}>
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>
              <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              Loading knowledge base...
            </div>
          ) : (
            <>
              {/* DOCUMENTS TAB */}
              {activeTab === 'documents' && (
                <div>
                  {documents.length === 0 ? (
                    <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '60px 40px', textAlign: 'center', border: '1.5px solid #e5e7eb' }}>
                      <div style={{ width: 72, height: 72, borderRadius: 22, background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <BookOpen size={32} color="#8b5cf6" />
                      </div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>No documents yet</h3>
                      <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
                        Upload PDFs, Word docs, or text files. The AI will extract pricing, services, policies and more automatically.
                      </p>
                      <button onClick={() => fileInputRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                        <Upload size={16} /> Upload First Document
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {documents.map(doc => (
                        <div key={doc.id} style={{ background: 'var(--surface)', borderRadius: 18, border: '1.5px solid #e5e7eb', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 14, background: doc.file_type?.includes('pdf') ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <File size={20} color={doc.file_type?.includes('pdf') ? '#ef4444' : '#3b82f6'} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.document_name}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                                {doc.processed === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.10)', padding: '2px 8px', borderRadius: 6, animation: 'pulse 1.5s infinite' }}>⏳ Processing...</span>}
                                {doc.processed === 1 && <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.10)', padding: '2px 8px', borderRadius: 6 }}>✅ {doc.memory_count} memories extracted</span>}
                                {doc.processed === 2 && <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', padding: '2px 8px', borderRadius: 6 }}>❌ Processing failed</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                              {doc.processed === 1 && doc.memory_count > 0 && (
                                <button onClick={() => handleExpandDoc(doc.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 10, border: '1.5px solid #c4b5fd', background: 'rgba(139,92,246,0.10)', color: '#7c3aed', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                                  <Database size={12} /> Memories {expandedDoc === doc.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                              )}
                              <button onClick={() => handleDeleteDoc(doc.id)} style={{ padding: '7px 12px', borderRadius: 10, border: '1.5px solid #fecaca', background: 'rgba(239,68,68,0.10)', color: '#ef4444', cursor: 'pointer' }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Expanded memories */}
                          {expandedDoc === doc.id && (
                            <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 20px', background: '#fafbff' }}>
                              {!docMemories[doc.id] ? (
                                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</p>
                              ) : docMemories[doc.id].length === 0 ? (
                                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No memories extracted from this document.</p>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                                  {docMemories[doc.id].map(m => {
                                    const ti = getTypeInfo(m.memory_type);
                                    return (
                                      <div key={m.id} style={{ padding: '12px 14px', background: 'var(--surface)', borderRadius: 12, border: `1.5px solid ${ti.color}33` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: ti.bg, color: ti.color, textTransform: 'uppercase' }}>{ti.label}</span>
                                          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{m.confidence}% confidence</span>
                                        </div>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 3px' }}>{m.key}</p>
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{m.value}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* MEMORIES TAB */}
              {activeTab === 'memories' && (
                <div>
                  {/* Toolbar */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search memories..."
                      style={{ padding: '9px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', width: 220 }}
                      onFocus={e => e.target.style.borderColor='#8b5cf6'} onBlur={e => e.target.style.borderColor='var(--border)'} />
                    <select value={filterType} onChange={e => setFilterType(e.target.value)}
                      style={{ padding: '9px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: 'var(--surface)', cursor: 'pointer' }}>
                      <option value="all">All Types</option>
                      {MEMORY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button onClick={() => { setEditingMemory(null); setMemoryForm({ memory_type: 'pricing', key: '', value: '', confidence: 90 }); setShowMemoryForm(true); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13, marginLeft: 'auto' }}>
                      <Plus size={14} /> Add Memory
                    </button>
                  </div>

                  {/* Add/Edit Memory Form */}
                  {showMemoryForm && (
                    <div style={{ background: 'rgba(139,92,246,0.10)', border: '2px solid #8b5cf6', borderRadius: 16, padding: 20, marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <p style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed', margin: 0 }}>{editingMemory ? 'Edit Memory' : 'Add Memory'}</p>
                        <button onClick={() => { setShowMemoryForm(false); setEditingMemory(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={16} /></button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Type</label>
                          <select value={memoryForm.memory_type} onChange={e => setMemoryForm(p => ({ ...p, memory_type: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #ddd6fe', borderRadius: 10, fontSize: 13, outline: 'none', background: 'var(--surface)', boxSizing: 'border-box' }}>
                            {MEMORY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Confidence %</label>
                          <input type="number" min="0" max="100" value={memoryForm.confidence} onChange={e => setMemoryForm(p => ({ ...p, confidence: parseInt(e.target.value) || 90 }))}
                            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #ddd6fe', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Key (Label)</label>
                        <input value={memoryForm.key} onChange={e => setMemoryForm(p => ({ ...p, key: e.target.value }))} placeholder="e.g. Graphic Design Course Fee"
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #ddd6fe', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                          onFocus={e => e.target.style.borderColor='#8b5cf6'} onBlur={e => e.target.style.borderColor='#ddd6fe'} />
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Value</label>
                        <textarea value={memoryForm.value} onChange={e => setMemoryForm(p => ({ ...p, value: e.target.value }))} placeholder="e.g. 45,000 PKR" rows={2}
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #ddd6fe', borderRadius: 10, fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          onFocus={e => e.target.style.borderColor='#8b5cf6'} onBlur={e => e.target.style.borderColor='#ddd6fe'} />
                      </div>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setShowMemoryForm(false); setEditingMemory(null); }} style={{ padding: '9px 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                        <button onClick={handleSaveMemory} disabled={savingMemory} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                          {savingMemory ? 'Saving...' : editingMemory ? 'Update' : 'Add Memory'}
                        </button>
                      </div>
                    </div>
                  )}

                  {filteredMemories.length === 0 ? (
                    <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '60px 40px', textAlign: 'center', border: '1.5px solid #e5e7eb' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>🧠</div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>No memories yet</h3>
                      <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 24 }}>Upload a document or click "Learn from Chats" to start building your AI's knowledge.</p>
                    </div>
                  ) : (
                    Object.entries(groupedMemories).map(([type, mems]) => {
                      const ti = getTypeInfo(type);
                      return (
                        <div key={type} style={{ marginBottom: 20 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 20, background: ti.bg, color: ti.color, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{ti.label}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{mems.length} {mems.length === 1 ? 'item' : 'items'}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                            {mems.map(m => (
                              <div key={m.id} style={{ background: 'var(--surface)', borderRadius: 14, border: `1.5px solid ${ti.color}33`, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                    <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{m.key}</p>
                                    <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto', flexShrink: 0 }}>{m.confidence}%</span>
                                  </div>
                                  <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.5 }}>{m.value}</p>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: m.source === 'manual' ? '#6366f1' : m.source === 'document' ? '#10b981' : '#f59e0b', background: m.source === 'manual' ? 'rgba(99,102,241,0.12)' : m.source === 'document' ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)', padding: '2px 8px', borderRadius: 6 }}>
                                    {m.source === 'manual' ? '✏️ Manual' : m.source === 'document' ? '📄 Document' : '💬 Auto-learned'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                                  <button onClick={() => openEditMemory(m)} style={{ padding: '5px 8px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}><Edit2 size={12} /></button>
                                  <button onClick={() => handleDeleteMemory(m.id)} style={{ padding: '5px 8px', borderRadius: 8, border: '1.5px solid #fecaca', background: 'rgba(239,68,68,0.10)', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={12} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </NavBar>
  );
}