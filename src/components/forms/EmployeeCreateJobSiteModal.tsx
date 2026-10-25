import { useState } from 'react';
import { errorMessage } from '@/lib/supabase';
import { useEmployeeCreateJobSite } from '@/hooks/useEmployeeJobSite';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Textarea } from '@/components/ui/form';

export function EmployeeCreateJobSiteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const create = useEmployeeCreateJobSite();
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setClientName('');
    setDescription('');
    setFormError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError('Job site name is required.');
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        client_name: clientName.trim() || null,
        description: description.trim() || null,
      });
      handleClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create job site.'));
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Create job site">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Create a new job site. You'll be automatically assigned to it.
        </p>
        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <FormField label="Site name" htmlFor="site-name" required>
          <Input
            id="site-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 123 Main St renovation"
          />
        </FormField>
        <FormField label="Client name" htmlFor="site-client" hint="Optional">
          <Input
            id="site-client"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g. John Smith"
          />
        </FormField>
        <FormField label="Description" htmlFor="site-desc" hint="Optional">
          <Textarea
            id="site-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the work"
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={create.isPending}
            disabled={!name.trim()}
          >
            Create site
          </Button>
        </div>
      </div>
    </Modal>
  );
}
