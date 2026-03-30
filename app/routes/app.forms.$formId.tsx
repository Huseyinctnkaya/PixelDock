import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  FormLayout,
  Icon,
  InlineStack,
  Modal,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  DeleteIcon,
  DragHandleIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ClipboardIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback, useRef } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { FormsRegistry, FormEntry } from "../forms.types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockType = "toggle_group" | "input" | "select" | "file" | "textarea" | "color" | "number" | "date" | "email" | "tel" | "checkbox" | "checkbox_group" | "divider" | "info" | "multi_file" | "rating" | "url";

export type FormBlock = {
  id: string;
  type: BlockType;
  label: string;
  name: string;
  required: boolean;
  placeholder?: string;
  options?: string;
  defaultValue?: string;
  accept?: string;
  min?: string;
  max?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const NAMESPACE = "pixeldock";
const REGISTRY_KEY = "forms_registry";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  toggle_group: "Seçici (Toggle Grup)",
  select: "Dropdown",
  input: "Metin Girişi",
  textarea: "Uzun Metin",
  file: "Dosya Yükleme",
  color: "Renk Seçici",
  number: "Sayı / Ölçü",
  date: "Tarih",
  email: "E-posta",
  tel: "Telefon",
  checkbox: "Onay Kutusu",
  checkbox_group: "Çoklu Seçim",
  divider: "Bölücü",
  info: "Bilgi Metni",
  multi_file: "Çoklu Dosya",
  rating: "Derecelendirme",
  url: "URL",
};

const BLOCK_TYPE_OPTIONS = (Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map(
  (type) => ({ label: BLOCK_TYPE_LABELS[type], value: type }),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchRegistry(admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"]): Promise<FormsRegistry> {
  const res = await admin.graphql(
    `#graphql
    query FormsRegistry($namespace: String!, $key: String!) {
      currentAppInstallation {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { variables: { namespace: NAMESPACE, key: REGISTRY_KEY } },
  );
  const data = (await res.json()) as {
    data?: {
      currentAppInstallation?: { metafield?: { value: string } | null } | null;
    };
  };
  const raw = data.data?.currentAppInstallation?.metafield?.value;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as FormsRegistry;
  } catch {
    return {};
  }
}

async function saveRegistry(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  registry: FormsRegistry,
): Promise<{ ok: boolean; error?: string }> {
  const appRes = await admin.graphql(
    `#graphql
    query AppId { currentAppInstallation { id } }`,
  );
  const appData = (await appRes.json()) as {
    data?: { currentAppInstallation?: { id: string } | null };
  };
  const ownerId = appData.data?.currentAppInstallation?.id;
  if (!ownerId) return { ok: false, error: "App installation bulunamadı." };

  const saveRes = await admin.graphql(
    `#graphql
    mutation SaveRegistry($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key updatedAt }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          key: REGISTRY_KEY,
          namespace: NAMESPACE,
          ownerId,
          type: "json",
          value: JSON.stringify(registry),
        }],
      },
    },
  );

  const saveData = (await saveRes.json()) as {
    data?: { metafieldsSet?: { userErrors?: Array<{ message: string }> | null } | null };
  };
  const errors = saveData.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) return { ok: false, error: errors[0].message };
  return { ok: true };
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const registry = await fetchRegistry(admin);
  const formId = params.formId as string;
  const form = registry[formId];
  if (!form) {
    throw new Response("Form bulunamadı", { status: 404 });
  }
  return { form };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const raw = formData.get("config") as string;
  const formId = params.formId as string;

  let updatedForm: FormEntry;
  try {
    updatedForm = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Geçersiz config." };
  }

  const registry = await fetchRegistry(admin);
  if (!registry[formId]) {
    return { ok: false, error: "Form bulunamadı." };
  }

  registry[formId] = { ...updatedForm, id: formId };

  const result = await saveRegistry(admin, registry);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, error: null };
};

// ─── Page Component ───────────────────────────────────────────────────────────

export default function FormEditor() {
  const { form: initialForm } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const isSaving = fetcher.state !== "idle";

  const [form, setForm] = useState<FormEntry>(initialForm);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newBlockType, setNewBlockType] = useState<BlockType>("input");

  // Drag & drop state
  const dragSrcIdx = useRef<number>(-1);
  const [dragOverIdx, setDragOverIdx] = useState<number>(-1);

  const handleDragStart = useCallback((idx: number) => {
    dragSrcIdx.current = idx;
  }, []);

  const handleDragOver = useCallback((idx: number) => {
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback((dropIdx: number) => {
    const srcIdx = dragSrcIdx.current;
    dragSrcIdx.current = -1;
    setDragOverIdx(-1);
    if (srcIdx === -1 || srcIdx === dropIdx) return;
    setForm((f) => {
      const blocks = [...f.blocks];
      const [moved] = blocks.splice(srcIdx, 1);
      blocks.splice(dropIdx, 0, moved);
      return { ...f, blocks };
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragSrcIdx.current = -1;
    setDragOverIdx(-1);
  }, []);

  const saved = fetcher.data?.ok === true;
  const saveError = fetcher.data?.error;

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.append("config", JSON.stringify(form));
    fetcher.submit(fd, { method: "post" });
  }, [form, fetcher]);

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(form.id).then(() => {
      shopify.toast.show("Form ID kopyalandı!");
    });
  }, [form.id, shopify]);

  const addBlock = useCallback(() => {
    const id = `block-${Date.now()}`;
    const newBlock: FormBlock = {
      id,
      type: newBlockType,
      label: BLOCK_TYPE_LABELS[newBlockType].toUpperCase(),
      name: `field_${id}`,
      required: false,
      ...(newBlockType === "toggle_group" || newBlockType === "select"
        ? { options: "Seçenek 1, Seçenek 2" }
        : {}),
      ...(newBlockType === "file" || newBlockType === "multi_file" ? { accept: ".png,.jpg,.jpeg" } : {}),
      ...(newBlockType === "rating" ? { defaultValue: "0" } : {}),
      ...(newBlockType === "checkbox_group" ? { options: "Seçenek 1, Seçenek 2" } : {}),
    };
    setForm((f) => ({ ...f, blocks: [...f.blocks, newBlock] }));
    setAddModalOpen(false);
  }, [newBlockType]);

  const updateBlock = useCallback((id: string, patch: Partial<FormBlock>) => {
    setForm((f) => ({
      ...f,
      blocks: f.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setForm((f) => ({ ...f, blocks: f.blocks.filter((b) => b.id !== id) }));
  }, []);

  const moveBlock = useCallback((id: string, direction: "up" | "down") => {
    setForm((f) => {
      const idx = f.blocks.findIndex((b) => b.id === id);
      if (idx === -1) return f;
      const next = direction === "up" ? idx - 1 : idx + 1;
      if (next < 0 || next >= f.blocks.length) return f;
      const blocks = [...f.blocks];
      [blocks[idx], blocks[next]] = [blocks[next], blocks[idx]];
      return { ...f, blocks };
    });
  }, []);

  return (
    <Page
      title={form.name || "Form Düzenle"}
      subtitle={`Form ID: ${form.id}`}
      backAction={{ content: "Formlar", url: "/app/forms" }}
      primaryAction={
        <Button variant="primary" loading={isSaving} onClick={handleSave}>
          Kaydet
        </Button>
      }
    >
      <BlockStack gap="500">

        {saved && (
          <Banner tone="success" onDismiss={() => {}}>
            Form kaydedildi.
          </Banner>
        )}
        {saveError && <Banner tone="critical">{saveError}</Banner>}

        {/* Form meta */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingSm" fontWeight="semibold">
              Form Ayarları
            </Text>

            {/* Form ID read-only */}
            <Box>
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" tone="subdued">
                  Form ID:
                </Text>
                <Badge>{form.id}</Badge>
                <Button
                  icon={ClipboardIcon}
                  variant="tertiary"
                  size="slim"
                  onClick={handleCopyId}
                >
                  Kopyala
                </Button>
              </InlineStack>
            </Box>

            <FormLayout>
              <TextField
                label="Form Adı"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                autoComplete="off"
                helpText="Bu ad yalnızca yönetim panelinde görünür"
              />
              <FormLayout.Group>
                <TextField
                  label="Modal başlığı"
                  value={form.title}
                  onChange={(v) => setForm((f) => ({ ...f, title: v }))}
                  autoComplete="off"
                />
                <TextField
                  label="Kaydet butonu yazısı"
                  value={form.submitLabel}
                  onChange={(v) => setForm((f) => ({ ...f, submitLabel: v }))}
                  autoComplete="off"
                />
              </FormLayout.Group>
            </FormLayout>
          </BlockStack>
        </Card>

        {/* Block list */}
        <Card padding="0">
          <Box paddingBlock="400" paddingInline="500">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingSm" fontWeight="semibold">
                  Form Alanları
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {form.blocks.length} alan
                </Text>
              </BlockStack>
              <Button
                icon={PlusIcon}
                onClick={() => setAddModalOpen(true)}
                variant="secondary"
              >
                Alan Ekle
              </Button>
            </InlineStack>
          </Box>

          <Divider />

          {form.blocks.length === 0 ? (
            <Box paddingBlock="800" paddingInline="500">
              <BlockStack gap="200" inlineAlign="center">
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  Henüz alan yok. "Alan Ekle" ile başla.
                </Text>
              </BlockStack>
            </Box>
          ) : (
            <BlockStack gap="0">
              {form.blocks.map((block, idx) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  idx={idx}
                  isFirst={idx === 0}
                  isLast={idx === form.blocks.length - 1}
                  isDragOver={dragOverIdx === idx}
                  onUpdate={updateBlock}
                  onDelete={deleteBlock}
                  onMove={moveBlock}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </BlockStack>
          )}
        </Card>

        <Box paddingBlockEnd="1200" />
      </BlockStack>

      {/* Add block modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Alan Ekle"
        primaryAction={{ content: "Ekle", onAction: addBlock }}
        secondaryActions={[{ content: "İptal", onAction: () => setAddModalOpen(false) }]}
      >
        <Modal.Section>
          <Select
            label="Alan tipi"
            options={BLOCK_TYPE_OPTIONS}
            value={newBlockType}
            onChange={(v) => setNewBlockType(v as BlockType)}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}

// ─── Block Row ────────────────────────────────────────────────────────────────

function BlockRow({
  block,
  idx,
  isFirst,
  isLast,
  isDragOver,
  onUpdate,
  onDelete,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  block: FormBlock;
  idx: number;
  isFirst: boolean;
  isLast: boolean;
  isDragOver: boolean;
  onUpdate: (id: string, patch: Partial<FormBlock>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onDragStart: (idx: number) => void;
  onDragOver: (idx: number) => void;
  onDrop: (idx: number) => void;
  onDragEnd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const hasOptions = block.type === "toggle_group" || block.type === "select" || block.type === "checkbox_group";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
        onDragStart(idx);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(idx);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(idx);
      }}
      onDragEnd={() => {
        setIsDragging(false);
        onDragEnd();
      }}
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderBottom: isDragOver ? "2px solid #C84B11" : undefined,
        transition: "opacity 0.15s",
        cursor: "grab",
      }}
    >
      <Box
        borderBlockEndWidth={isLast && !isDragOver ? "0" : "025"}
        borderColor="border"
      >
        {/* Row header */}
        <Box paddingBlock="300" paddingInline="500">
          <InlineStack align="space-between" blockAlign="center" wrap={false}>
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <Box>
                <Icon source={DragHandleIcon} tone="subdued" />
              </Box>
              <BlockStack gap="050">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {block.label || "(isimsiz)"}
                  </Text>
                  <Badge tone="info">{BLOCK_TYPE_LABELS[block.type]}</Badge>
                  {block.required && <Badge tone="attention">Zorunlu</Badge>}
                </InlineStack>
                {hasOptions && block.options && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {block.options}
                  </Text>
                )}
              </BlockStack>
            </InlineStack>

            <InlineStack gap="100" wrap={false}>
              <Button
                icon={ChevronUpIcon}
                variant="tertiary"
                size="slim"
                disabled={isFirst}
                onClick={() => onMove(block.id, "up")}
                accessibilityLabel="Yukarı taşı"
              />
              <Button
                icon={ChevronDownIcon}
                variant="tertiary"
                size="slim"
                disabled={isLast}
                onClick={() => onMove(block.id, "down")}
                accessibilityLabel="Aşağı taşı"
              />
              <Button
                variant="tertiary"
                size="slim"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? "Kapat" : "Düzenle"}
              </Button>
              <Button
                icon={DeleteIcon}
                variant="tertiary"
                size="slim"
                tone="critical"
                onClick={() => onDelete(block.id)}
                accessibilityLabel="Sil"
              />
            </InlineStack>
          </InlineStack>
        </Box>

        {/* Inline edit panel */}
        <div
          style={{
            display: "grid",
            gridTemplateRows: expanded ? "1fr" : "0fr",
            transition: "grid-template-rows 0.2s ease",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <Box
              background="bg-surface-secondary"
              paddingBlock="400"
              paddingInline="500"
              borderBlockStartWidth="025"
              borderBlockEndWidth="025"
              borderColor="border"
            >
              <FormLayout>
                <FormLayout.Group>
                  <TextField
                    label="Etiket"
                    value={block.label}
                    onChange={(v) => onUpdate(block.id, { label: v })}
                    autoComplete="off"
                    helpText="Formda gösterilecek alan başlığı"
                  />
                  <TextField
                    label="Alan adı"
                    value={block.name}
                    onChange={(v) => onUpdate(block.id, { name: v })}
                    autoComplete="off"
                    helpText="Sipariş notunda kullanılacak anahtar (boşluksuz)"
                  />
                </FormLayout.Group>

                {hasOptions && (
                  <TextField
                    label="Seçenekler"
                    value={block.options ?? ""}
                    onChange={(v) => onUpdate(block.id, { options: v })}
                    autoComplete="off"
                    helpText="Virgülle ayır: Göğüs, Kol, Sırt"
                  />
                )}

                {hasOptions && (
                  <TextField
                    label="Varsayılan seçenek"
                    value={block.defaultValue ?? ""}
                    onChange={(v) => onUpdate(block.id, { defaultValue: v })}
                    autoComplete="off"
                    helpText="Sayfa açıldığında seçili gelecek değer"
                  />
                )}

                {(block.type === "input" || block.type === "textarea") && (
                  <TextField
                    label="Placeholder"
                    value={block.placeholder ?? ""}
                    onChange={(v) => onUpdate(block.id, { placeholder: v })}
                    autoComplete="off"
                  />
                )}

                {block.type === "file" && (
                  <TextField
                    label="Kabul edilen dosya tipleri"
                    value={block.accept ?? ".png,.jpg,.jpeg"}
                    onChange={(v) => onUpdate(block.id, { accept: v })}
                    autoComplete="off"
                    helpText="Örn: .png,.jpg,.jpeg,.svg"
                  />
                )}

                {(block.type === "multi_file") && (
                  <TextField
                    label="Kabul edilen dosya tipleri"
                    value={block.accept ?? ".png,.jpg,.jpeg"}
                    onChange={(v) => onUpdate(block.id, { accept: v })}
                    autoComplete="off"
                    helpText="Örn: .png,.jpg,.jpeg,.svg"
                  />
                )}

                {block.type === "number" && (
                  <FormLayout.Group>
                    <TextField
                      label="Min değer"
                      value={block.min ?? ""}
                      onChange={(v) => onUpdate(block.id, { min: v })}
                      autoComplete="off"
                      type="number"
                    />
                    <TextField
                      label="Max değer"
                      value={block.max ?? ""}
                      onChange={(v) => onUpdate(block.id, { max: v })}
                      autoComplete="off"
                      type="number"
                    />
                  </FormLayout.Group>
                )}

                {block.type === "info" && (
                  <TextField
                    label="Bilgi metni içeriği"
                    value={block.label}
                    onChange={(v) => onUpdate(block.id, { label: v })}
                    autoComplete="off"
                    multiline={3}
                    helpText="Müşteriye gösterilecek açıklama metni"
                  />
                )}

                {block.type === "rating" && (
                  <TextField
                    label="Varsayılan puan (0 = seçilmemiş)"
                    value={block.defaultValue ?? "0"}
                    onChange={(v) => onUpdate(block.id, { defaultValue: v })}
                    autoComplete="off"
                    type="number"
                    min="0"
                    max="5"
                  />
                )}

                <Select
                  label="Zorunlu alan"
                  options={[
                    { label: "Evet", value: "true" },
                    { label: "Hayır", value: "false" },
                  ]}
                  value={block.required ? "true" : "false"}
                  onChange={(v) => onUpdate(block.id, { required: v === "true" })}
                />
              </FormLayout>
            </Box>
          </div>
        </div>
      </Box>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
