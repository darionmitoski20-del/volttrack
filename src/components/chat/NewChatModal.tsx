import { useState } from 'react';
import { errorMessage } from '@/lib/supabase';
import { useEmployees } from '@/hooks/useEmployees';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useCreateDm, useCreateGroupChannel } from '@/hooks/useChat';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';

export function NewChatModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (channelId: string) => void;
}) {
  const { userId } = useCompanyContext();
  const employees = useEmployees();
  const createDm = useCreateDm();
  const createGroup = useCreateGroupChannel();

  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const others = (employees.data ?? []).filter(
    (m) => m.user_id !== userId && m.status === 'active',
  );

  const reset = () => {
    setMode('dm');
    setSelectedUsers([]);
    setGroupName('');
    setFormError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const toggleUser = (id: string) => {
    if (mode === 'dm') {
      setSelectedUsers([id]);
    } else {
      setSelectedUsers((prev) =>
        prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id],
      );
    }
  };

  const submit = async () => {
    setFormError(null);
    if (selectedUsers.length === 0) {
      setFormError('Select at least one person.');
      return;
    }
    try {
      if (mode === 'dm') {
        const ch = await createDm.mutateAsync(selectedUsers[0]!);
        handleClose();
        onCreated(ch.id);
      } else {
        if (!groupName.trim()) {
          setFormError('Group name is required.');
          return;
        }
        const ch = await createGroup.mutateAsync({
          name: groupName.trim(),
          memberIds: selectedUsers,
        });
        handleClose();
        onCreated(ch.id);
      }
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create chat.'));
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="New conversation">
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('dm'); setSelectedUsers([]); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === 'dm' ? 'bg-navy-800 text-white' : 'bg-navy-100 text-ink-muted'
            }`}
          >
            Direct message
          </button>
          <button
            onClick={() => { setMode('group'); setSelectedUsers([]); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === 'group' ? 'bg-navy-800 text-white' : 'bg-navy-100 text-ink-muted'
            }`}
          >
            Group
          </button>
        </div>

        {mode === 'group' && (
          <FormField label="Group name" htmlFor="group-name" required>
            <Input
              id="group-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Site crew"
            />
          </FormField>
        )}

        <FormField label={mode === 'dm' ? 'Select a person' : 'Add members'} htmlFor="chat-members">
          <div className="max-h-48 overflow-y-auto rounded-xl border border-navy-200 divide-y divide-navy-50">
            {others.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">No team members available.</p>
            ) : (
              others.map((m) => {
                const selected = selectedUsers.includes(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => toggleUser(m.user_id)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      selected ? 'bg-volt-50' : 'hover:bg-navy-50/50'
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-200 text-xs font-bold text-navy-700">
                      {m.profile.full_name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 text-sm font-medium text-ink">{m.profile.full_name}</span>
                    {selected && (
                      <span className="h-2.5 w-2.5 rounded-full bg-volt-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </FormField>

        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={createDm.isPending || createGroup.isPending}
            disabled={selectedUsers.length === 0}
          >
            {mode === 'dm' ? 'Open chat' : 'Create group'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
