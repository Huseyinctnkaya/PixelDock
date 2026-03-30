import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineGrid,
  InlineStack,
  Page,
  Tabs,
  Text,
} from "@shopify/polaris";
import { PlusIcon, DeleteIcon, EditIcon } from "@shopify/polaris-icons";
import { useEffect, useState } from "react";
import type { BlockType, FormBlock, FormEntry, FormStatus, FormsRegistry } from "../forms.types";

export type { BlockType, FormBlock, FormEntry, FormStatus, FormsRegistry };

// ─── Constants ────────────────────────────────────────────────────────────────

const NAMESPACE = "pixeldock";
const REGISTRY_KEY = "forms_registry";

const DEFAULT_BLOCKS: FormBlock[] = [
  {
    id: "block-1",
    type: "toggle_group",
    label: "REGION",
    name: "region",
    required: true,
    options: "Chest, Arm, Back",
    defaultValue: "Chest",
  },
  {
    id: "block-2",
    type: "toggle_group",
    label: "SIDE",
    name: "side",
    required: true,
    options: "Left, Right",
    defaultValue: "Left",
  },
  {
    id: "block-3",
    type: "toggle_group",
    label: "SHAPE",
    name: "shape",
    required: true,
    options: "Round, Rectangle",
    defaultValue: "Round",
  },
  {
    id: "block-4",
    type: "file",
    label: "LOGO FILE",
    name: "logo",
    required: true,
    accept: ".png,.jpg,.jpeg",
  },
  {
    id: "block-5",
    type: "textarea",
    label: "ADDITIONAL NOTE (OPTIONAL)",
    name: "note",
    required: false,
    placeholder: "You can write your special requests here...",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const registry = await fetchRegistry(admin);
  const forms = Object.values(registry).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return { forms };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const registry = await fetchRegistry(admin);

  if (intent === "create") {
    const id = generateId();
    const newForm: FormEntry = {
      id,
      name: "New Form",
      title: "Patch Settings",
      submitLabel: "Save",
      blocks: DEFAULT_BLOCKS.map((b) => ({ ...b, id: `${b.id}-${id}` })),
      createdAt: new Date().toISOString(),
      status: "draft",
    };
    registry[id] = newForm;
    const result = await saveRegistry(admin, registry);
    if (!result.ok) return { ok: false, error: result.error, newId: null };
    return { ok: true, error: null, newId: id };
  }

  if (intent === "toggle_status") {
    const id = formData.get("id") as string;
    if (registry[id]) {
      registry[id].status = registry[id].status === "active" ? "draft" : "active";
      const result = await saveRegistry(admin, registry);
      if (!result.ok) return { ok: false, error: result.error, newId: null };
    }
    return { ok: true, error: null, newId: null };
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    delete registry[id];
    const result = await saveRegistry(admin, registry);
    if (!result.ok) return { ok: false, error: result.error, newId: null };
    return { ok: true, error: null, newId: null };
  }

  return { ok: false, error: "Unknown intent.", newId: null };
};

// ─── Page Component ───────────────────────────────────────────────────────────

const TABS = [
  { id: "all", content: "All" },
  { id: "active", content: "Active" },
  { id: "draft", content: "Draft" },
];

export default function FormsIndex() {
  const { forms } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);

  const isCreating = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "create";

  useEffect(() => {
    if (fetcher.data?.newId) {
      navigate(`/app/forms/${fetcher.data.newId}`);
    }
  }, [fetcher.data, navigate]);

  const handleCreate = () => {
    const fd = new FormData();
    fd.append("intent", "create");
    fetcher.submit(fd, { method: "post" });
  };

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.append("intent", "delete");
    fd.append("id", id);
    fetcher.submit(fd, { method: "post" });
  };

  const handleToggleStatus = (id: string) => {
    const fd = new FormData();
    fd.append("intent", "toggle_status");
    fd.append("id", id);
    fetcher.submit(fd, { method: "post" });
  };

  const filterKey = TABS[selectedTab].id;
  const filteredForms = filterKey === "all"
    ? forms
    : forms.filter((f) => (f.status ?? "draft") === filterKey);

  const activeCnt = forms.filter((f) => (f.status ?? "draft") === "active").length;
  const draftCnt = forms.filter((f) => (f.status ?? "draft") === "draft").length;

  const tabs = [
    { id: "all", content: `All (${forms.length})` },
    { id: "active", content: `Active (${activeCnt})` },
    { id: "draft", content: `Draft (${draftCnt})` },
  ];

  return (
    <Page
      title="Forms"
      primaryAction={
        <Button
          icon={PlusIcon}
          variant="primary"
          loading={isCreating}
          onClick={handleCreate}
        >
          New Form
        </Button>
      }
    >
      {forms.length === 0 ? (
        <EmptyState
          heading="No forms yet"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          action={{ content: "Create New Form", onAction: handleCreate }}
        >
          <p>Manage the forms shown to your customers from here.</p>
        </EmptyState>
      ) : (
        <BlockStack gap="400">
          <Card padding="0">
            <Tabs
              tabs={tabs}
              selected={selectedTab}
              onSelect={setSelectedTab}
            />
          </Card>

          {filteredForms.length === 0 ? (
            <Box paddingBlock="800">
              <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                No forms match this filter.
              </Text>
            </Box>
          ) : (
            <BlockStack gap="300">
              {filteredForms.map((form) => {
                const isActive = (form.status ?? "draft") === "active";
                const isToggling =
                  fetcher.state !== "idle" &&
                  fetcher.formData?.get("intent") === "toggle_status" &&
                  fetcher.formData?.get("id") === form.id;

                return (
                  <Card key={form.id} padding="500">
                    <InlineGrid columns="1fr auto" alignItems="center" gap="400">
                      <BlockStack gap="150">
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <Text as="h3" variant="headingSm" fontWeight="semibold">
                            {form.name}
                          </Text>
                          <Badge tone="info">{form.id}</Badge>
                          <Badge tone={isActive ? "success" : "attention"}>
                            {isActive ? "Active" : "Draft"}
                          </Badge>
                        </InlineStack>
                        <InlineStack gap="400">
                          <Text as="p" variant="bodySm" tone="subdued">
                            {form.blocks.length} fields
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {new Date(form.createdAt).toLocaleDateString("en-GB")}
                          </Text>
                        </InlineStack>
                      </BlockStack>
                      <InlineStack gap="200" wrap={false}>
                        <Button
                          variant="tertiary"
                          size="slim"
                          loading={isToggling}
                          onClick={() => handleToggleStatus(form.id)}
                        >
                          {isActive ? "Unpublish" : "Publish"}
                        </Button>
                        <Button
                          icon={EditIcon}
                          variant="secondary"
                          size="slim"
                          onClick={() => navigate(`/app/forms/${form.id}`)}
                        >
                          Edit
                        </Button>
                        <Button
                          icon={DeleteIcon}
                          variant="tertiary"
                          size="slim"
                          tone="critical"
                          onClick={() => handleDelete(form.id)}
                        >
                          Delete
                        </Button>
                      </InlineStack>
                    </InlineGrid>
                  </Card>
                );
              })}
            </BlockStack>
          )}
        </BlockStack>
      )}

      <Box paddingBlockEnd="1200" />
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
