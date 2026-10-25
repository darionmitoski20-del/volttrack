import { useState } from 'react';
import { Plus, Trash2, Download, Image as ImageIcon } from 'lucide-react';
import { formatDate } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useMaterials, useDeleteMaterial } from '@/hooks/useMaterials';
import { PageHeader } from '@/components/ui/widgets';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/states';
import { AddMaterialModal } from '@/components/forms/AddMaterialModal';
import { ImageLightbox } from '@/components/chat/ImageLightbox';

export function EmployeeMaterialsPage() {
  const { timezone, userId } = useCompanyContext();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState('');
  const materials = useMaterials();
  const deleteMaterial = useDeleteMaterial();

  const handleViewPhoto = (photoUrl: string | null) => {
    if (photoUrl) {
      setLightboxSrc(photoUrl);
      setLightboxOpen(true);
    }
  };

  const handleDelete = async (materialId: string) => {
    if (confirm('Delete this material?')) {
      await deleteMaterial.mutateAsync(materialId);
    }
  };

  const myMaterials = materials.data?.filter((m) => m.added_by === userId) || [];

  return (
    <div className="pb-24">
      <PageHeader
        title="Materials"
        subtitle="Track supplies you've purchased for job sites."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setAddModalOpen(true)}
            className="lg:inline-flex hidden"
          >
            Add Material
          </Button>
        }
      />

      {!materials.data || myMaterials.length === 0 ? (
        <Card>
          <EmptyState
            icon={Plus}
            title="No materials yet"
            description="Add materials you've purchased for your job sites."
            action={
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setAddModalOpen(true)}
              >
                Add Material
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {myMaterials.map((m) => (
            <Card key={m.id}>
              <CardBody className="space-y-3">
                <div className="flex items-start gap-3">
                  {m.photo_url ? (
                    <button
                      onClick={() => handleViewPhoto(m.photo_url)}
                      className="shrink-0 overflow-hidden rounded-lg hover:opacity-80"
                    >
                      <img
                        src={m.photo_url}
                        alt={m.name}
                        className="h-16 w-16 object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-navy-100">
                      <ImageIcon className="h-6 w-6 text-ink-subtle" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{m.name}</p>
                        <p className="text-sm text-ink-muted">{m.category_name}</p>
                      </div>
                      {m.price && (
                        <p className="shrink-0 text-lg font-semibold text-ink">
                          ${(m.price * m.quantity).toFixed(2)}
                        </p>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-ink-muted">
                      <span>{m.quantity} {m.unit}</span>
                      {m.price && <span>@ ${m.price.toFixed(2)}</span>}
                      <span>•</span>
                      <span>{formatDate(m.created_at, timezone)}</span>
                    </div>
                  </div>
                </div>
                {m.description && (
                  <p className="text-sm text-ink-muted italic">"{m.description}"</p>
                )}
                <div className="flex gap-2 pt-2">
                  {m.receipt_url && (
                    <a
                      href={m.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-volt-600 hover:text-volt-700"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Receipt
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(m.id)}
                    disabled={deleteMaterial.isPending}
                    className="ml-auto flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <AddMaterialModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />

      {lightboxOpen && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Material photo"
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Mobile FAB Button */}
      <button
        onClick={() => setAddModalOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-volt-500 shadow-lg hover:bg-volt-600 active:scale-95 transition-all lg:hidden"
        aria-label="Add material"
      >
        <Plus className="h-6 w-6 text-navy-900" strokeWidth={2.5} />
      </button>
    </div>
  );
}
