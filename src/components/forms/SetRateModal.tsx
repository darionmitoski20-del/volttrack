import { useState } from 'react';
import { errorMessage } from '@/lib/supabase';
import { useSetMemberRate } from '@/hooks/useRates';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export function SetRateModal({
  member,
  currentRate,
  onClose,
}: {
  member: { id: string; name: string } | null;
  currentRate: number | null;
  onClose: () => void;
}) {
  const setRate = useSetMemberRate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Seed the input when a member is picked
  const [seeded, setSeeded] = useState<string | null>(null);
  if (member && seeded !== member.id) {
    setSeeded(member.id);
    setValue(currentRate != null ? String(currentRate) : '');
    setError(null);
  }

  const save = async () => {
    if (!member) return;
    const rate = Number(value);
    if (!value.trim() || Number.isNaN(rate) || rate < 0) {
      setError('Enter a valid hourly rate.');
      return;
    }
    try {
      await setRate.mutateAsync({ memberId: member.id, rate });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the rate.'));
    }
  };

  return (
    <Modal open={!!member} onClose={onClose} title="Hourly rate" className="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Rate for <span className="font-semibold text-ink">{member?.name}</span>. The employee
        will see it and their earnings in the app.
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div>
          <label htmlFor="rate-input" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            Hourly rate ($)
          </label>
          <input
            id="rate-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="22.00"
            className="w-full rounded-xl border border-navy-200 bg-white px-4 py-3 text-lg font-semibold tabular-nums text-ink focus:border-volt-400 focus:outline-none focus:ring-2 focus:ring-volt-400/30"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={setRate.isPending} className="flex-1">
            Save rate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
