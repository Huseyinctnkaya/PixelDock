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
} from "@shopify/polaris-icons";
import { useState, useCallback, useId } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockType = "toggle_group" | "input" | "select" | "file" | "textarea";

export type FormBlock = {
  id: string;
  type: BlockType;
  label: string;
  name: string;
  required: boolean;
  placeholder?: string;
  options?: string;       // comma-separated, for toggle_group and select
  defaultValue?: string;
  accept?: string;        // for file: "image/*" etc.
};

export type FormConfig = {
  title: string;
  submitLabel: string;
  blocks: FormBlock[];
};

const DEFAULT_CONFIG: FormConfig = {
  title: "Patch Ayarları",
  submitLabel: "Kaydet",
  blocks: [
    {
      id: "block-1",
      type: "toggle_group",
      label: "BÖLGE",
      name: "bolge",
      required: true,
      options: "Göğüs, Kol, Sırt",
      defaultValue: "Göğüs",
    },
    {
      id: "block-2",
      type: "toggle_group",
      label: "YAN",
      name: "yan",
      required: true,
      options: "Sol, Sağ",
      defaultValue: "Sol",
    },
    {
      id: "block-3",
      type: "toggle_group",
      label: "ŞEKİL",
      name: "sekil",
      required: true,
      options: "Yuvarlak, Dikdörtgen",
      defaultValue: "Yuvarlak",
    },
    {
      id: "block-4",
      type: "file",
      label: "LOGO DOSYASI",
      name: "logo",
      required: true,
      accept: ".png,.jpg,.jpeg",
    },
    {
      id: "block-5",
      type: "textarea",
      label: "EK NOT (OPSİYONEL)",
      name: "note",
      required: false,
      placeholder: "Özel isteklerinizi buraya yazabilirsiniz...",
    },
  ],
};

const NAMESPACE = "pixeldock";
const FORM_CONFIG_KEY = "form_config";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  toggle_group: "Seçici (Toggle Grup)",
  select: "Dropdown",
  input: "Metin Girişi",
  textarea: "Uzun Metin",
  file: "Dosya Yükleme",
};

const BLOCK_TYPE_OPTIONS = (Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map(
  (type) => ({ label: BLOCK_TYPE_LABELS[type], value: type }),
);

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(
    `#graphql
    query FormConfig($namespace: String!, $key: String!) {
      currentAppInstallation {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { variables: { namespace: NAMESPACE, key: FORM_CONFIG_KEY } },
  );

  const data = (await res.json()) as {
    data?: {
      currentAppInstallation?: { metafield?: { value: string } | null } | null;
    };
  };

  const raw = data.data?.currentAppInstallation?.metafield?.value;
  let config: FormConfig = DEFAULT_CONFIG;

  if (raw) {
    try {
      config = JSON.parse(raw);
    } catch {
      // use default
    }
  }

  return { config };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const raw = form.get("config") as string;

  let config: FormConfig;
  try {
    config = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Geçersiz config." };
  }

  const appRes = await admin.graphql(
    `#graphql query AppId { currentAppInstallation { id } }`,
  );
  const appData = (await appRes.json()) as {
    data?: { currentAppInstallation?: { id: string } | null };
  };
  const ownerId = appData.data?.currentAppInstallation?.id;
  if (!ownerId) return { ok: false, error: "App installation bulunamadı." };

  const saveRes = await admin.graphql(
    `#graphql
    mutation SaveFormConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key updatedAt }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          key: FORM_CONFIG_KEY,
          namespace: NAMESPACE,
          ownerId,
          type: "json",
          value: JSON.stringify(config),
        }],
      },
    },
  );

  const saveData = (await saveRes.json()) as {
    data?: { metafieldsSet?: { userErrors?: Array<{ message: string }> | null } | null };
  };
  const errors = saveData.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) return { ok: false, error: errors[0].message };

  return { ok: true, error: null };
};

// ─── Page Component ───────────────────────────────────────────────────────────

export default function FormBuilder() {
  const { config: initialConfig } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isSaving = fetcher.state !== "idle";

  const [config, setConfig] = useState<FormConfig>(initialConfig);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newBlockType, setNewBlockType] = useState<BlockType>("input");

  const saved = fetcher.data?.ok === true;
  const saveError = fetcher.data?.error;

  const handleSave = useCallback(() => {
    const form = new FormData();
    form.append("config", JSON.stringify(config));
    fetcher.submit(form, { method: "post" });
  }, [config, fetcher]);

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
      ...(newBlockType === "file" ? { accept: ".png,.jpg,.jpeg" } : {}),
    };
    setConfig((c) => ({ ...c, blocks: [...c.blocks, newBlock] }));
    setAddModalOpen(false);
  }, [newBlockType]);

  const updateBlock = useCallback((id: string, patch: Partial<FormBlock>) => {
    setConfig((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setConfig((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
  }, []);

  const moveBlock = useCallback((id: string, direction: "up" | "down") => {
    setConfig((c) => {
      const idx = c.blocks.findIndex((b) => b.id === id);
      if (idx === -1) return c;
      const next = direction === "up" ? idx - 1 : idx + 1;
      if (next < 0 || next >= c.blocks.length) return c;
      const blocks = [...c.blocks];
      [blocks[idx], blocks[next]] = [blocks[next], blocks[idx]];
      return { ...c, blocks };
    });
  }, []);

  return (
    <Page
      title="Form Builder"
      subtitle="Müşterilere gösterilecek formu özelleştir"
      primaryAction={
        <Button variant="primary" loading={isSaving} onClick={handleSave}>
          Kaydet
        </Button>
      }
    >
      <BlockStack gap="500">

        {saved && (
          <Banner tone="success" onDismiss={() => {}}>
            Form kaydedildi. Tema extension'ı güncel config'i okuyacak.
          </Banner>
        )}
        {saveError && <Banner tone="critical">{saveError}</Banner>}

        {/* Form meta */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingSm" fontWeight="semibold">
              Form Ayarları
            </Text>
            <FormLayout>
              <FormLayout.Group>
                <TextField
                  label="Modal başlığı"
                  value={config.title}
                  onChange={(v) => setConfig((c) => ({ ...c, title: v }))}
                  autoComplete="off"
                />
                <TextField
                  label="Kaydet butonu yazısı"
                  value={config.submitLabel}
                  onChange={(v) => setConfig((c) => ({ ...c, submitLabel: v }))}
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
                  {config.blocks.length} alan
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

          {config.blocks.length === 0 ? (
            <Box paddingBlock="800" paddingInline="500">
              <BlockStack gap="200" inlineAlign="center">
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  Henüz alan yok. "Alan Ekle" ile başla.
                </Text>
              </BlockStack>
            </Box>
          ) : (
            <BlockStack gap="0">
              {config.blocks.map((block, idx) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  isFirst={idx === 0}
                  isLast={idx === config.blocks.length - 1}
                  onUpdate={updateBlock}
                  onDelete={deleteBlock}
                  onMove={moveBlock}
                />
              ))}
            </BlockStack>
          )}
        </Card>

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
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMove,
}: {
  block: FormBlock;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (id: string, patch: Partial<FormBlock>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasOptions = block.type === "toggle_group" || block.type === "select";

  return (
    <Box
      borderBlockEndWidth={isLast ? "0" : "025"}
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
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
