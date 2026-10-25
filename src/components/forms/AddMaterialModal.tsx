import { useState } from 'react';
import { Camera, Plus, X } from 'lucide-react';
import { errorMessage, supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompression';
import { useAuth } from '@/features/auth/AuthProvider';
import { useJobSiteOptions } from '@/hooks/useJobSites';
import { useAddMaterial, useMaterialCategories, useUpsertMaterialCategory } from '@/hooks/useMaterials';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField, Input, Textarea, Select } from '@/components/ui/form';

export function AddMaterialModal({
  open,
  onClose,
  jobSiteId = '',
}: {
  open: boolean;
  onClose: () => void;
  jobSiteId?: string;
}) {
  const { profile } = useAuth();
  const [selectedJobSite, setSelectedJobSite] = useState(jobSiteId);
  const [name, setName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [price, setPrice] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useAddMaterial();
  const categories = useMaterialCategories();
  const upsertCategory = useUpsertMaterialCategory();
  const jobSites = useJobSiteOptions();

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setError(null);
    setPhotoProcessing(true);
    try {
      const compressed = await compressImage(file);
      setPhoto(compressed);
    } catch {
      // Compression is best-effort — fall back to the original file rather
      // than blocking the upload (e.g. an unsupported HEIC in this browser).
      setPhoto(file);
    } finally {
      setPhotoProcessing(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.trim()) return;
    setError(null);
    try {
      const created = await upsertCategory.mutateAsync(newCategory.trim());
      setCategoryName(created.name);
      setNewCategory('');
      setAddingCategory(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not create category'));
    }
  };

  const reset = () => {
    setSelectedJobSite(jobSiteId);
    setName('');
    setCategoryName('');
    setAddingCategory(false);
    setNewCategory('');
    setDescription('');
    setQuantity('1');
    setUnit('pcs');
    setPrice('');
    setPhoto(null);
    setPhotoProcessing(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!selectedJobSite) {
      setError('Please select a job site');
      return;
    }
    if (!name.trim()) {
      setError('Material name is required');
      return;
    }
    if (!categoryName.trim()) {
      setError('Please select a category');
      return;
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      setError('Quantity must be greater than 0');
      return;
    }

    try {
      let photoUrl: string | undefined;

      if (photo) {
        const path = `materials/${selectedJobSite}/${Date.now()}-photo`;
        const { error: photoError } = await supabase.storage.from('material-photos').upload(path, photo);
        if (photoError) throw photoError;
        const { data } = supabase.storage.from('material-photos').getPublicUrl(path);
        photoUrl = data.publicUrl;
      }

      await add.mutateAsync({
        jobSiteId: selectedJobSite,
        categoryName: categoryName.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        quantity: parseFloat(quantity),
        unit,
        price: price ? parseFloat(price) : undefined,
        photoUrl,
        clockIn: new Date().toISOString(),
      });

      handleClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not add material'));
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Material">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        {/* Job site — who it's for / where it's used */}
        <FormField label="Job Site (Client)" required>
          <Select value={selectedJobSite} onChange={(e) => setSelectedJobSite(e.target.value)}>
            <option value="">Select job site...</option>
            {jobSites.data?.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </FormField>

        {/* Who's adding it — auto-filled, read-only */}
        <FormField label="Added by">
          <div className="flex h-11 items-center rounded-xl border border-navy-100 bg-navy-50 px-3 text-sm text-ink-muted">
            {profile?.full_name ?? 'You'}
          </div>
        </FormField>

        <FormField label="Material Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Cement, Paint, Steel"
          />
        </FormField>

        {/* Category — pick existing, or add a new one inline */}
        <FormField label="Category" required>
          {addingCategory ? (
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category name"
                className="flex-1"
                autoFocus
              />
              <Button variant="primary" size="sm" onClick={handleCreateCategory} loading={upsertCategory.isPending}>
                Add
              </Button>
              <button
                type="button"
                onClick={() => {
                  setAddingCategory(false);
                  setNewCategory('');
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-navy-100"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="flex-1">
                <option value="">Select category...</option>
                {categories.data?.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setAddingCategory(true)}
              >
                New
              </Button>
            </div>
          )}
        </FormField>

        <FormField label="Description" hint="Optional">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any additional notes..."
            rows={2}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Quantity" required>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              step="0.01"
              min="0"
            />
          </FormField>
          <FormField label="Unit">
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="pcs">pcs</option>
              <option value="kg">kg</option>
              <option value="l">l</option>
              <option value="m">m</option>
              <option value="m2">m²</option>
              <option value="m3">m³</option>
              <option value="box">box</option>
              <option value="set">set</option>
            </Select>
          </FormField>
        </div>

        <FormField label="Price" hint="Optional">
          <Input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            step="0.01"
            min="0"
            placeholder="0.00"
          />
        </FormField>

        <FormField label="Photo" hint="Optional">
          <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-200 px-4 py-3 cursor-pointer hover:border-navy-300 transition-colors">
            <Camera className="h-5 w-5 text-ink-muted" />
            <span className="text-sm text-ink-muted">
              {photoProcessing ? 'Processing photo…' : photo ? photo.name : 'Click to upload photo'}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              disabled={photoProcessing}
              className="hidden"
            />
          </label>
        </FormField>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={add.isPending} disabled={photoProcessing} onClick={handleSubmit}>
            Add Material
          </Button>
        </div>
      </div>
    </Modal>
  );
}
