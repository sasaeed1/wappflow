import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {leads} from '../config/api';
import {format} from 'date-fns';

export default function LeadDetailScreen({route, navigation}) {
  const {leadId} = route.params;
  const [lead, setLead] = useState(null);
  const [notes, setNotes] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newNote, setNewNote] = useState('');
  const [newReminderDate, setNewReminderDate] = useState('');
  const [newReminderMessage, setNewReminderMessage] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [saleAmount, setSaleAmount] = useState('');

  useEffect(() => {
    loadLead();
  }, []);

  const loadLead = async () => {
    try {
      setLoading(true);
      const response = await leads.getOne(leadId);
      setLead(response.data.lead);
      setNotes(response.data.notes);
      setReminders(response.data.reminders);
      setSelectedStatus(response.data.lead.status);
      setSaleAmount(response.data.lead.actual_sale?.toString() || '');
    } catch (error) {
      console.error('Error loading lead:', error);
      Alert.alert('Error', 'Failed to load lead');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      Alert.alert('Error', 'Please enter a note');
      return;
    }

    try {
      await leads.addNote(leadId, newNote);
      setNewNote('');
      loadLead();
      Alert.alert('Success', 'Note added');
    } catch (error) {
      Alert.alert('Error', 'Failed to add note');
    }
  };

  const handleAddReminder = async () => {
    if (!newReminderDate) {
      Alert.alert('Error', 'Please enter a reminder date (YYYY-MM-DD HH:MM)');
      return;
    }

    try {
      await leads.addReminder(leadId, {
        reminder_date: newReminderDate,
        message: newReminderMessage,
      });
      setNewReminderDate('');
      setNewReminderMessage('');
      loadLead();
      Alert.alert('Success', 'Reminder added');
    } catch (error) {
      Alert.alert('Error', 'Failed to add reminder');
    }
  };

  const handleUpdateStatus = async () => {
    try {
      const updateData = {status: selectedStatus};
      if (selectedStatus === 'Closed' && saleAmount) {
        updateData.actual_sale = parseFloat(saleAmount);
      }

      await leads.update(leadId, updateData);
      Alert.alert('Success', 'Status updated');
      loadLead();
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleToggleReminder = async (reminderId, isCompleted) => {
    try {
      await leads.updateReminder(leadId, reminderId, {
        is_completed: isCompleted ? 0 : 1,
      });
      loadLead();
    } catch (error) {
      Alert.alert('Error', 'Failed to update reminder');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#25D366" />
      </View>
    );
  }

  if (!lead) {
    return null;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer Info</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{lead.customer_name || 'Unknown'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone:</Text>
          <Text style={styles.infoValue}>{lead.customer_phone}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>First Message:</Text>
          <Text style={styles.infoValue}>"{lead.first_message}"</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Created:</Text>
          <Text style={styles.infoValue}>
            {format(new Date(lead.created_at), 'MMM d, yyyy h:mm a')}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Update Status</Text>

        <Text style={styles.label}>Status</Text>
        <View style={styles.statusButtons}>
          {['New', 'Interested', 'Closed'].map(status => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusButton,
                selectedStatus === status && styles.statusButtonActive,
              ]}
              onPress={() => setSelectedStatus(status)}>
              <Text
                style={[
                  styles.statusButtonText,
                  selectedStatus === status && styles.statusButtonTextActive,
                ]}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedStatus === 'Closed' && (
          <>
            <Text style={styles.label}>Sale Amount (Rs)</Text>
            <TextInput
              style={styles.input}
              value={saleAmount}
              onChangeText={setSaleAmount}
              placeholder="5000"
              keyboardType="numeric"
            />
          </>
        )}

        <TouchableOpacity style={styles.button} onPress={handleUpdateStatus}>
          <Text style={styles.buttonText}>Update Status</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notes</Text>

        <TextInput
          style={[styles.input, styles.textArea]}
          value={newNote}
          onChangeText={setNewNote}
          placeholder="Add a note about this customer..."
          multiline
          numberOfLines={3}
        />
        <TouchableOpacity style={styles.button} onPress={handleAddNote}>
          <Text style={styles.buttonText}>Add Note</Text>
        </TouchableOpacity>

        {notes.length === 0 ? (
          <Text style={styles.emptyText}>No notes yet</Text>
        ) : (
          notes.map(note => (
            <View key={note.id} style={styles.noteCard}>
              <Text style={styles.noteDate}>
                {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
              </Text>
              <Text style={styles.noteContent}>{note.content}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reminders</Text>

        <Text style={styles.label}>Reminder Date (YYYY-MM-DD HH:MM)</Text>
        <TextInput
          style={styles.input}
          value={newReminderDate}
          onChangeText={setNewReminderDate}
          placeholder="2024-12-25 10:00"
        />

        <Text style={styles.label}>Message (optional)</Text>
        <TextInput
          style={styles.input}
          value={newReminderMessage}
          onChangeText={setNewReminderMessage}
          placeholder="Follow up about pricing"
        />

        <TouchableOpacity style={styles.button} onPress={handleAddReminder}>
          <Text style={styles.buttonText}>Add Reminder</Text>
        </TouchableOpacity>

        {reminders.length === 0 ? (
          <Text style={styles.emptyText}>No reminders set</Text>
        ) : (
          reminders.map(reminder => (
            <View
              key={reminder.id}
              style={[
                styles.reminderCard,
                reminder.is_completed && styles.reminderCompleted,
              ]}>
              <View style={styles.reminderContent}>
                <Text style={styles.reminderDate}>
                  {format(new Date(reminder.reminder_date), 'MMM d, yyyy h:mm a')}
                </Text>
                {reminder.message && (
                  <Text style={styles.reminderMessage}>{reminder.message}</Text>
                )}
              </View>
              <TouchableOpacity
                style={[
                  styles.reminderButton,
                  reminder.is_completed && styles.reminderButtonCompleted,
                ]}
                onPress={() =>
                  handleToggleReminder(reminder.id, reminder.is_completed)
                }>
                <Text style={styles.reminderButtonText}>
                  {reminder.is_completed ? 'Reopen' : 'Complete'}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
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
  card: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#000',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    width: 120,
  },
  infoValue: {
    fontSize: 14,
    color: '#000',
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#000',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#25D366',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statusButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: '#25D366',
    borderColor: '#25D366',
  },
  statusButtonText: {
    fontSize: 14,
    color: '#666',
  },
  statusButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  noteCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    paddingLeft: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  noteDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  noteContent: {
    fontSize: 14,
    color: '#000',
  },
  reminderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 12,
  },
  reminderCompleted: {
    opacity: 0.5,
  },
  reminderContent: {
    flex: 1,
  },
  reminderDate: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
    marginBottom: 4,
  },
  reminderMessage: {
    fontSize: 12,
    color: '#666',
  },
  reminderButton: {
    backgroundColor: '#25D366',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  reminderButtonCompleted: {
    backgroundColor: '#999',
  },
  reminderButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 10,
  },
});