'use client';

import { useState } from 'react';
import { X, User, Phone, DollarSign, MessageSquare, Tag } from 'lucide-react';

export default function AddLeadModal({ isOpen, onClose, onLeadAdded }) {
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    status: 'New',
    estimated_value: '',
    first_message: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.customer_phone) { setError('Phone number is required'); return; }
    setLoading(true);
    try {
      const { leadsAPI } = await import('../lib/api');
      await leadsAPI.create({
        ...formData,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : null
      });
      setFormData({ customer_name: '', customer_phone: '', status: 'New', estimated_value: '', first_message: '' });
      if (onLeadAdded) onLeadAdded();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg">
          {/* Glow effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-2xl blur opacity-30" />
          <div className="relative bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <div>
                <h2 className="text-xl font-bold text-white">New Lead</h2>
                <p className="text-sm text-gray-400 mt-0.5">Add a contact to your pipeline</p>
              </div>
              <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Customer Name
                  </label>
                  <input
                    type="text"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
                    placeholder="Ahmed Khan"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:bg-white/8 transition-all text-sm"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({...formData, customer_phone: e.target.value})}
                    placeholder="+92 300 1234567"
                    required
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 focus:bg-white/8 transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500 transition-all text-sm"
                  >
                    <option value="New" className="bg-[#0f1117]">New</option>
                    <option value="Contacted" className="bg-[#0f1117]">Contacted</option>
                    <option value="Interested" className="bg-[#0f1117]">Interested</option>
                    <option value="Negotiating" className="bg-[#0f1117]">Negotiating</option>
                    <option value="Closed - Won" className="bg-[#0f1117]">Closed - Won</option>
                    <option value="Closed - Lost" className="bg-[#0f1117]">Closed - Lost</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> Value (Rs)
                  </label>
                  <input
                    type="number"
                    value={formData.estimated_value}
                    onChange={(e) => setFormData({...formData, estimated_value: e.target.value})}
                    placeholder="25,000"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-green-500 focus:bg-white/8 transition-all text-sm"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> First Message
                  </label>
                  <textarea
                    value={formData.first_message}
                    onChange={(e) => setFormData({...formData, first_message: e.target.value})}
                    placeholder="Hi! I'm interested in your products..."
                    rows="3"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:bg-white/8 transition-all text-sm resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl font-medium transition-all text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={loading}
                  className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-cyan-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-violet-500/25 transition-all disabled:opacity-50 text-sm">
                  {loading ? 'Creating...' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}