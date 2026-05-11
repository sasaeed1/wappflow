'use client';

import { useState, useEffect } from 'react';
import { displayPhone, API_URL } from '../../lib/api';
import { useRouter } from 'next/navigation';
import { 
  Trash2, 
  RotateCcw, 
  XCircle, 
  AlertTriangle,
  ArrowLeft,
  Clock,
  Calendar
} from 'lucide-react';

export default function TrashPage() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [actionType, setActionType] = useState(null); // 'restore' or 'delete'

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }
    fetchTrash();
  }, []);

  const fetchTrash = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/leads/trash`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (error) {
      console.error('Failed to fetch trash:', error);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = (lead) => {
    setSelectedLead(lead);
    setActionType('restore');
    setShowConfirmModal(true);
  };

  const handlePermanentDelete = (lead) => {
    setSelectedLead(lead);
    setActionType('delete');
    setShowConfirmModal(true);
  };

  const confirmAction = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (actionType === 'restore') {
        await fetch(`${API_URL}/leads/${selectedLead.id}/restore`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } else {
        await fetch(`${API_URL}/leads/${selectedLead.id}/permanent`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
      
      setShowConfirmModal(false);
      setSelectedLead(null);
      fetchTrash();
    } catch (error) {
      console.error('Failed to perform action:', error);
    }
  };

  const getDaysRemaining = (deletedAt) => {
    const deleted = new Date(deletedAt);
    const now = new Date();
    const daysPassed = Math.floor((now - deleted) / (1000 * 60 * 60 * 24));
    const daysRemaining = 90 - daysPassed;
    return daysRemaining > 0 ? daysRemaining : 0;
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'New': return 'bg-blue-100 text-blue-700';
      case 'Interested': return 'bg-yellow-100 text-yellow-700';
      case 'Closed': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-red-600 mx-auto"></div>
          <p className="mt-6 text-lg font-medium text-gray-700">Loading trash...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50 to-orange-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-all"
              >
                <ArrowLeft className="w-6 h-6 text-gray-600" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Trash2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Trash</h1>
                  <p className="text-xs text-gray-500">{leads.length} deleted leads</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all font-semibold"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* Info Banner */}
        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-6 mb-8 flex items-start space-x-4">
          <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-orange-900 mb-1">Leads are automatically deleted after 90 days</h3>
            <p className="text-sm text-orange-700">
              Deleted leads stay in trash for 90 days before being permanently removed. You can restore them anytime before then.
            </p>
          </div>
        </div>

        {/* Empty State */}
        {leads.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-16 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-2xl mb-6">
              <Trash2 className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Trash is empty</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              When you delete leads, they'll appear here for 90 days before being permanently removed.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-50 to-orange-50">
              <h3 className="text-lg font-bold text-gray-900">Deleted Leads</h3>
              <p className="text-sm text-gray-600 mt-1">Restore or permanently delete these leads</p>
            </div>

            <div className="divide-y divide-gray-200">
              {leads.map((lead) => {
                const daysRemaining = getDaysRemaining(lead.deleted_at);
                
                return (
                  <div
                    key={lead.id}
                    className="p-6 hover:bg-gray-50 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      {/* Lead Info */}
                      <div className="flex items-center space-x-4 flex-1">
                        <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg">
                          {lead.customer_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-1">
                            <h4 className="font-semibold text-gray-900 text-lg">
                              {lead.customer_name || 'Unknown'}
                            </h4>
                            <span className={`px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(lead.status)}`}>
                              {lead.status}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <span>{displayPhone(lead.customer_phone)}</span>
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-4 h-4" />
                              <span>Deleted {new Date(lead.deleted_at).toLocaleDateString()}</span>
                            </span>
                            <span className={`flex items-center space-x-1 ${daysRemaining < 7 ? 'text-red-600 font-semibold' : 'text-orange-600'}`}>
                              <Clock className="w-4 h-4" />
                              <span>{daysRemaining} days remaining</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleRestore(lead)}
                          className="flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition-all font-semibold"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Restore</span>
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(lead)}
                          className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-all font-semibold"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Delete Forever</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
              actionType === 'restore' 
                ? 'bg-green-100' 
                : 'bg-red-100'
            }`}>
              {actionType === 'restore' ? (
                <RotateCcw className="w-8 h-8 text-green-600" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-red-600" />
              )}
            </div>
            
            <h3 className="text-2xl font-bold text-gray-900 text-center mb-3">
              {actionType === 'restore' ? 'Restore Lead?' : 'Delete Permanently?'}
            </h3>
            
            <p className="text-gray-600 text-center mb-8">
              {actionType === 'restore' ? (
                <>Restore <strong>{selectedLead?.customer_name}</strong> back to your leads?</>
              ) : (
                <>This will <strong>permanently delete</strong> {selectedLead?.customer_name}. This action cannot be undone!</>
              )}
            </p>
            
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setSelectedLead(null);
                }}
                className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                className={`flex-1 px-6 py-3 text-white rounded-xl transition-all font-semibold ${
                  actionType === 'restore'
                    ? 'bg-gradient-to-r from-green-600 to-green-700 hover:shadow-lg'
                    : 'bg-gradient-to-r from-red-600 to-red-700 hover:shadow-lg'
                }`}
              >
                {actionType === 'restore' ? 'Restore' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}