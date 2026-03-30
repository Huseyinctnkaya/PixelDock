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
  Spinner,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import {
  DeleteIcon,
  DragHandleIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ClipboardIcon,
  SearchIcon,
  XIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback, useRef, useEffect } from "react";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
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
  toggle_group: "Toggle Group",
  select: "Dropdown",
  input: "Text Input",
  textarea: "Long Text",
  file: "File Upload",
  color: "Color Picker",
  number: "Number / Measurement",
  date: "Date",
  email: "Email",
  tel: "Phone",
  checkbox: "Checkbox",
  checkbox_group: "Multi-Select",
  divider: "Divider",
  info: "Info Text",
  multi_file: "Multiple Files",
  rating: "Rating",
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
  if (!ownerId) return { ok: false, error: "App installation not found." };

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
    throw new Response("Form not found", { status: 404 });
  }

  // Fetch ALL metafield definitions from the store for the metafield picker
  const metaRes = await admin.graphql(`#graphql
    query AllMetafieldDefs {
      productDefs: metafieldDefinitions(ownerType: PRODUCT, first: 100) {
        nodes { namespace key name }
      }
      customerDefs: metafieldDefinitions(ownerType: CUSTOMER, first: 100) {
        nodes { namespace key name }
      }
      orderDefs: metafieldDefinitions(ownerType: ORDER, first: 100) {
        nodes { namespace key name }
      }
    }
  `);
  const metaData = (await metaRes.json()) as {
    data?: {
      productDefs?: { nodes: Array<{ namespace: string; key: string; name: string }> };
      customerDefs?: { nodes: Array<{ namespace: string; key: string; name: string }> };
      orderDefs?: { nodes: Array<{ namespace: string; key: string; name: string }> };
    };
  };

  const metafieldDefs = [
    ...(metaData.data?.productDefs?.nodes ?? []).map((n) => ({ label: `${n.name} · ${n.namespace}.${n.key} (Product)`, value: `${n.namespace}.${n.key}` })),
    ...(metaData.data?.customerDefs?.nodes ?? []).map((n) => ({ label: `${n.name} · ${n.namespace}.${n.key} (Customer)`, value: `${n.namespace}.${n.key}` })),
    ...(metaData.data?.orderDefs?.nodes ?? []).map((n) => ({ label: `${n.name} · ${n.namespace}.${n.key} (Order)`, value: `${n.namespace}.${n.key}` })),
  ];

  // Resolve titles for already-assigned products
  type AssignedProduct = { id: string; title: string; image: string | null };
  let assignedProducts: AssignedProduct[] = [];
  const assignedIds = form.assignedProductIds ?? [];
  if (assignedIds.length > 0) {
    const prodRes = await admin.graphql(
      `#graphql
      query ProductsByIds($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            featuredImage { url }
          }
        }
      }`,
      { variables: { ids: assignedIds } },
    );
    const prodData = (await prodRes.json()) as {
      data?: { nodes?: Array<{ id?: string; title?: string; featuredImage?: { url: string } | null } | null> | null };
    };
    assignedProducts = (prodData.data?.nodes ?? [])
      .filter((n): n is { id: string; title: string; featuredImage?: { url: string } | null } => !!n?.id)
      .map((n) => ({ id: n.id, title: n.title ?? "", image: n.featuredImage?.url ?? null }));
  }

  return { form, metafieldDefs, assignedProducts };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string | null;
  const formId = params.formId as string;

  // ── Product search (read-only, no registry mutation) ──────────────────────
  if (intent === "search_products") {
    const query = (formData.get("query") as string)?.trim() ?? "";
    const searchRes = await admin.graphql(
      `#graphql
      query SearchProducts($query: String!) {
        products(first: 8, query: $query) {
          nodes {
            id
            title
            featuredImage { url }
          }
        }
      }`,
      { variables: { query } },
    );
    const searchData = (await searchRes.json()) as {
      data?: { products?: { nodes?: Array<{ id: string; title: string; featuredImage?: { url: string } | null }> } };
    };
    const products = (searchData.data?.products?.nodes ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      image: p.featuredImage?.url ?? null,
    }));
    return { ok: true, error: null, products };
  }

  // ── Save form config ───────────────────────────────────────────────────────
  const raw = formData.get("config") as string;
  let updatedForm: FormEntry;
  try {
    updatedForm = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid config.", products: null };
  }

  const registry = await fetchRegistry(admin);
  if (!registry[formId]) {
    return { ok: false, error: "Form not found.", products: null };
  }

  registry[formId] = { ...updatedForm, id: formId };

  const result = await saveRegistry(admin, registry);
  if (!result.ok) return { ok: false, error: result.error, products: null };
  return { ok: true, error: null, products: null };
};

// ─── Page Component ───────────────────────────────────────────────────────────

type AssignedProduct = { id: string; title: string; image: string | null };

export default function FormEditor() {
  const { form: initialForm, metafieldDefs, assignedProducts: initialAssignedProducts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const searchFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const isSaving = fetcher.state !== "idle";

  const [form, setForm] = useState<FormEntry>(initialForm);
  const [isDirty, setIsDirty] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newBlockType, setNewBlockType] = useState<BlockType>("input");

  // ── Product assignment ────────────────────────────────────────────────────
  const [assignedProducts, setAssignedProducts] = useState<AssignedProduct[]>(initialAssignedProducts);
  const [productQuery, setProductQuery] = useState("");
  const searchResults: AssignedProduct[] = (searchFetcher.data as { products?: AssignedProduct[] } | undefined)?.products ?? [];
  const isSearching = searchFetcher.state !== "idle";

  const handleProductSearch = useCallback((q: string) => {
    setProductQuery(q);
    if (!q.trim()) return;
    const fd = new FormData();
    fd.append("intent", "search_products");
    fd.append("query", q);
    searchFetcher.submit(fd, { method: "post" });
  }, [searchFetcher]);

  const handleAssignProduct = useCallback((product: AssignedProduct) => {
    if (assignedProducts.some((p) => p.id === product.id)) return;
    const next = [...assignedProducts, product];
    setAssignedProducts(next);
    setForm((f) => ({ ...f, assignedProductIds: next.map((p) => p.id) }));
    setProductQuery("");
    setIsDirty(true);
  }, [assignedProducts]);

  const handleUnassignProduct = useCallback((id: string) => {
    const next = assignedProducts.filter((p) => p.id !== id);
    setAssignedProducts(next);
    setForm((f) => ({ ...f, assignedProductIds: next.map((p) => p.id) }));
    setIsDirty(true);
  }, [assignedProducts]);

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
    setIsDirty(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragSrcIdx.current = -1;
    setDragOverIdx(-1);
  }, []);

  const saveError = fetcher.data?.error;

  useEffect(() => {
    if (isDirty) shopify.saveBar.show("form-editor-save-bar");
    else shopify.saveBar.hide("form-editor-save-bar");
  }, [isDirty, shopify]);

  useEffect(() => {
    if (fetcher.data?.ok === true) setIsDirty(false);
  }, [fetcher.data]);

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.append("config", JSON.stringify(form));
    fetcher.submit(fd, { method: "post" });
  }, [form, fetcher]);

  const handleDiscard = useCallback(() => {
    setForm(initialForm);
    setIsDirty(false);
  }, [initialForm]);

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(form.id).then(() => {
      shopify.toast.show("Form ID copied!");
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
        ? { options: "Option 1, Option 2" }
        : {}),
      ...(newBlockType === "file" || newBlockType === "multi_file" ? { accept: ".png,.jpg,.jpeg" } : {}),
      ...(newBlockType === "rating" ? { defaultValue: "0" } : {}),
      ...(newBlockType === "checkbox_group" ? { options: "Option 1, Option 2" } : {}),
    };
    setForm((f) => ({ ...f, blocks: [...f.blocks, newBlock] }));
    setIsDirty(true);
    setAddModalOpen(false);
  }, [newBlockType]);

  const updateBlock = useCallback((id: string, patch: Partial<FormBlock>) => {
    setForm((f) => ({
      ...f,
      blocks: f.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
    setIsDirty(true);
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setForm((f) => ({ ...f, blocks: f.blocks.filter((b) => b.id !== id) }));
    setIsDirty(true);
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
    setIsDirty(true);
  }, []);

  return (
    <Page
      title={form.name || "Edit Form"}
      subtitle={`Form ID: ${form.id}`}
      backAction={{ content: "Forms", url: "/app/forms" }}
    >
      <SaveBar id="form-editor-save-bar">
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>Save</button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>
      <BlockStack gap="500">

        {saveError && <Banner tone="critical">{saveError}</Banner>}

        {/* Form meta */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingSm" fontWeight="semibold">
              Form Settings
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
                  Copy
                </Button>
              </InlineStack>
            </Box>

            <FormLayout>
              <TextField
                label="Form Name"
                value={form.name}
                onChange={(v) => { setForm((f) => ({ ...f, name: v })); setIsDirty(true); }}
                autoComplete="off"
                helpText="This name is only visible in the admin panel"
              />
              <FormLayout.Group>
                <TextField
                  label="Modal title"
                  value={form.title}
                  onChange={(v) => { setForm((f) => ({ ...f, title: v })); setIsDirty(true); }}
                  autoComplete="off"
                />
                <TextField
                  label="Save button label"
                  value={form.submitLabel}
                  onChange={(v) => { setForm((f) => ({ ...f, submitLabel: v })); setIsDirty(true); }}
                  autoComplete="off"
                />
              </FormLayout.Group>
            </FormLayout>
          </BlockStack>
        </Card>

        {/* Assigned Products */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingSm" fontWeight="semibold">
                Assigned Products
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                This form will automatically load on the product pages below. No manual Form ID entry needed.
              </Text>
            </BlockStack>

            {/* Search */}
            <Box>
              <TextField
                label="Search products"
                labelHidden
                prefix={<Icon source={SearchIcon} />}
                value={productQuery}
                onChange={handleProductSearch}
                placeholder="Search by product name…"
                autoComplete="off"
                connectedRight={isSearching ? <Box padding="200"><Spinner size="small" /></Box> : undefined}
              />
              {productQuery.trim() && searchResults.length > 0 && (
                <Box
                  background="bg-surface"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="200"
                  shadow="200"
                  paddingBlock="100"
                >
                  {searchResults.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleAssignProduct(p)}
                      style={{ cursor: "pointer", padding: "8px 12px" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#F6F6F7")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        <Thumbnail
                          source={p.image ?? ""}
                          alt={p.title}
                          size="small"
                        />
                        <Text as="p" variant="bodyMd">{p.title}</Text>
                        {assignedProducts.some((ap) => ap.id === p.id) && (
                          <Badge tone="success">Assigned</Badge>
                        )}
                      </InlineStack>
                    </div>
                  ))}
                </Box>
              )}
            </Box>

            {/* Assigned list */}
            {assignedProducts.length === 0 ? (
              <Text as="p" variant="bodySm" tone="subdued">
                No products assigned yet.
              </Text>
            ) : (
              <BlockStack gap="200">
                {assignedProducts.map((p) => (
                  <Box
                    key={p.id}
                    background="bg-surface-secondary"
                    borderRadius="200"
                    padding="300"
                    borderWidth="025"
                    borderColor="border"
                  >
                    <InlineStack align="space-between" blockAlign="center" wrap={false}>
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        <Thumbnail source={p.image ?? ""} alt={p.title} size="small" />
                        <Text as="p" variant="bodyMd">{p.title}</Text>
                      </InlineStack>
                      <Button
                        icon={XIcon}
                        variant="tertiary"
                        size="slim"
                        tone="critical"
                        onClick={() => handleUnassignProduct(p.id)}
                        accessibilityLabel="Remove"
                      />
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {/* Block list */}
        <Card padding="0">
          <Box paddingBlock="400" paddingInline="500">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingSm" fontWeight="semibold">
                  Form Fields
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {form.blocks.length} fields
                </Text>
              </BlockStack>
              <Button
                icon={PlusIcon}
                onClick={() => setAddModalOpen(true)}
                variant="secondary"
              >
                Add Field
              </Button>
            </InlineStack>
          </Box>

          <Divider />

          {form.blocks.length === 0 ? (
            <Box paddingBlock="800" paddingInline="500">
              <BlockStack gap="200" inlineAlign="center">
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  No fields yet. Click "Add Field" to get started.
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
                  metafieldDefs={metafieldDefs}
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
        title="Add Field"
        primaryAction={{ content: "Add", onAction: addBlock }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAddModalOpen(false) }]}
      >
        <Modal.Section>
          <Select
            label="Field type"
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
  metafieldDefs,
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
  metafieldDefs: Array<{ label: string; value: string }>;
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
                    {block.label || "(unnamed)"}
                  </Text>
                  <Badge tone="info">{BLOCK_TYPE_LABELS[block.type]}</Badge>
                  {block.required && <Badge tone="attention">Required</Badge>}
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
                accessibilityLabel="Move up"
              />
              <Button
                icon={ChevronDownIcon}
                variant="tertiary"
                size="slim"
                disabled={isLast}
                onClick={() => onMove(block.id, "down")}
                accessibilityLabel="Move down"
              />
              <Button
                variant="tertiary"
                size="slim"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? "Close" : "Edit"}
              </Button>
              <Button
                icon={DeleteIcon}
                variant="tertiary"
                size="slim"
                tone="critical"
                onClick={() => onDelete(block.id)}
                accessibilityLabel="Delete"
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
                    label="Label"
                    value={block.label}
                    onChange={(v) => onUpdate(block.id, { label: v })}
                    autoComplete="off"
                    helpText="Field title shown in the form"
                  />
                  <TextField
                    label="Field name"
                    value={block.name}
                    onChange={(v) => onUpdate(block.id, { name: v })}
                    autoComplete="off"
                    helpText="Key used in order notes (no spaces)"
                  />
                </FormLayout.Group>

                {hasOptions && (
                  <TextField
                    label="Options"
                    value={block.options ?? ""}
                    onChange={(v) => onUpdate(block.id, { options: v })}
                    autoComplete="off"
                    helpText="Comma-separated: Chest, Arm, Back"
                  />
                )}

                {hasOptions && (
                  <TextField
                    label="Default option"
                    value={block.defaultValue ?? ""}
                    onChange={(v) => onUpdate(block.id, { defaultValue: v })}
                    autoComplete="off"
                    helpText="Value selected when the page loads"
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
                    label="Accepted file types"
                    value={block.accept ?? ".png,.jpg,.jpeg"}
                    onChange={(v) => onUpdate(block.id, { accept: v })}
                    autoComplete="off"
                    helpText="e.g. .png,.jpg,.jpeg,.svg"
                  />
                )}

                {(block.type === "multi_file") && (
                  <TextField
                    label="Accepted file types"
                    value={block.accept ?? ".png,.jpg,.jpeg"}
                    onChange={(v) => onUpdate(block.id, { accept: v })}
                    autoComplete="off"
                    helpText="e.g. .png,.jpg,.jpeg,.svg"
                  />
                )}

                {block.type === "number" && (
                  <FormLayout.Group>
                    <TextField
                      label="Min value"
                      value={block.min ?? ""}
                      onChange={(v) => onUpdate(block.id, { min: v })}
                      autoComplete="off"
                      type="number"
                    />
                    <TextField
                      label="Max value"
                      value={block.max ?? ""}
                      onChange={(v) => onUpdate(block.id, { max: v })}
                      autoComplete="off"
                      type="number"
                    />
                  </FormLayout.Group>
                )}

                {block.type === "info" && (
                  <TextField
                    label="Info text content"
                    value={block.label}
                    onChange={(v) => onUpdate(block.id, { label: v })}
                    autoComplete="off"
                    multiline={3}
                    helpText="Description text shown to the customer"
                  />
                )}

                {block.type === "rating" && (
                  <TextField
                    label="Default rating (0 = none)"
                    value={block.defaultValue ?? "0"}
                    onChange={(v) => onUpdate(block.id, { defaultValue: v })}
                    autoComplete="off"
                    type="number"
                    min="0"
                    max="5"
                  />
                )}

                <Select
                  label="Required field"
                  options={[
                    { label: "Yes", value: "true" },
                    { label: "No", value: "false" },
                  ]}
                  value={block.required ? "true" : "false"}
                  onChange={(v) => onUpdate(block.id, { required: v === "true" })}
                />

                {block.type !== "divider" && block.type !== "info" && (
                  <Select
                    label="Save as metafield"
                    options={[
                      { label: "— Don't save —", value: "" },
                      ...metafieldDefs,
                    ]}
                    value={block.metafieldKey ?? ""}
                    onChange={(v) => onUpdate(block.id, { metafieldKey: v || undefined })}
                    helpText={
                      block.metafieldKey
                        ? `On form submission the value will be written to the "${block.metafieldKey}" metafield.`
                        : "Create a metafield definition in Shopify Admin → Settings → Custom data, then select it here."
                    }
                  />
                )}
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
