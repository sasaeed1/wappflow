import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {leads, analytics, auth} from '../config/api';
import {format} from 'date-fns';

export default function DashboardScreen({navigation}) {
  const [leadsData, setLeadsData] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [leadsRes, statsRes] = await Promise.all([
        leads.getAll(filter),
        analytics.getStats(),
      ]);
      setLeadsData(leadsRes.data.leads);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [filter]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleLogout = async () => {
    await auth.logout();
    navigation.replace('Login');
  };

  const getStatusColor = status => {
    switch (status) {
      case 'New':
        return '#3B82F6';
      case 'Interested':
        return '#F59E0B';
      case 'Closed':
        return '#10B981';
      default:
        return '#6B7280';
    }
  };

  const renderLead = ({item}) => (
    <TouchableOpacity
      style={styles.leadCard}
      onPress={() => navigation.navigate('LeadDetail', {leadId: item.id})}>
      <View style={styles.leadHeader}>
        <Text style={styles.leadName}>{item.customer_name || 'Unknown'}</Text>
        <View
          style={[
            styles.statusBadge,
            {backgroundColor: getStatusColor(item.status)},
          ]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>

      <Text style={styles.leadPhone}>{item.customer_phone}</Text>
      <Text style={styles.leadMessage} numberOfLines={2}>
        "{item.first_message}"
      </Text>

      <View style={styles.leadFooter}>
        <Text style={styles.leadDate}>
          {format(new Date(item.created_at), 'MMM d, yyyy')}
        </Text>
        <Text style={styles.leadMeta}>💬 {item.total_messages}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#25D366" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WappFlow</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Leads Today</Text>
            <Text style={styles.statValue}>{stats.leads_today}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Sales Today</Text>
            <Text style={styles.statValue}>
              Rs {stats.sales_today.toLocaleString()}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Conversion</Text>
            <Text style={styles.statValue}>{stats.conversion_rate}%</Text>
          </View>
        </View>
      )}

      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterButton, filter === '' && styles.filterActive]}
          onPress={() => setFilter('')}>
          <Text
            style={[
              styles.filterText,
              filter === '' && styles.filterTextActive,
            ]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'New' && styles.filterActive]}
          onPress={() => setFilter('New')}>
          <Text
            style={[
              styles.filterText,
              filter === 'New' && styles.filterTextActive,
            ]}>
            New
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'Interested' && styles.filterActive,
          ]}
          onPress={() => setFilter('Interested')}>
          <Text
            style={[
              styles.filterText,
              filter === 'Interested' && styles.filterTextActive,
            ]}>
            Interested
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'Closed' && styles.filterActive,
          ]}
          onPress={() => setFilter('Closed')}>
          <Text
            style={[
              styles.filterText,
              filter === 'Closed' && styles.filterTextActive,
            ]}>
            Closed
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={leadsData}
        renderItem={renderLead}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No leads yet. Waiting for WhatsApp messages...
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#25D366',
  },
  logoutText: {
    color: '#666',
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  filters: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  filterActive: {
    backgroundColor: '#25D366',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
  },
  leadCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  leadName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  leadPhone: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  leadMessage: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  leadFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leadDate: {
    fontSize: 12,
    color: '#999',
  },
  leadMeta: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});