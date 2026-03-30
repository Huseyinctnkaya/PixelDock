import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  FormLayout,
  IndexTable,
  InlineStack,
  Modal,
  Page,
  Select,
  Text,
  TextField,
  Banner,
} from "@shopify/polaris";
import { PlusIcon, DeleteIcon } from "@shopify/polaris-icons";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MetafieldDef = {
  id: string;
  name: string;
  namespace: string;
  key: string;
  type: string;
  description: string | null;
  ownerType: string;
};

const OWNER_LABELS: Record<string, string> = {
  PRODUCT: "Ürün",
  CUSTOMER: "Müşteri",
  ORDER: "Sipariş",
};

const TYPE_OPTIONS = [
  { label: "Tek satır metin", value: "single_line_text_field" },
  { label: "Çok satır metin", value: "multi_line_text_field" },
  { label: "URL", value: "url" },
  { label: "Sayı (tam)", value: "number_integer" },
  { label: "Sayı (ondalık)", value: "number_decimal" },
  { label: "Tarih", value: "date" },
  { label: "Renk", value: "color" },
  { label: "JSON", value: "json" },
];

const OWNER_OPTIONS = [
  { label: "Ürün", value: "PRODUCT" },
  { label: "Müşteri", value: "CUSTOMER" },
  { label: "Sipariş", value: "ORDER" },
];

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(`#graphql
    query MetafieldDefs {
      productDefs: metafieldDefinitions(ownerType: PRODUCT, first: 50, namespace: "pixeldock") {
        nodes { id name namespace key type { name } description }
      }
      customerDefs: metafieldDefinitions(ownerType: CUSTOMER, first: 50, namespace: "pixeldock") {
        nodes { id name namespace key type { name } description }
      }
      orderDefs: metafieldDefinitions(ownerType: ORDER, first: 50, namespace: "pixeldock") {
        nodes { id name namespace key type { name } description }
      }
    }
  `);

  const data = (await res.json()) as {
    data?: {
      productDefs?: { nodes: Array<{ id: string; name: string; namespace: string; key: string; type: { name: string }; description: string | null }> };
      customerDefs?: { nodes: Array<{ id: string; name: string; namespace: string; key: string; type: { name: string }; description: string | null }> };
      orderDefs?: { nodes: Array<{ id: string; name: string; namespace: string; key: string; type: { name: string }; description: string | null }> };
    };
  };

  const defs: MetafieldDef[] = [
    ...(data.data?.productDefs?.nodes ?? []).map((n) => ({ ...n, type: n.type.name, ownerType: "PRODUCT" })),
    ...(data.data?.customerDefs?.nodes ?? []).map((n) => ({ ...n, type: n.type.name, ownerType: "CUSTOMER" })),
    ...(data.data?.orderDefs?.nodes ?? []).map((n) => ({ ...n, type: n.type.name, ownerType: "ORDER" })),
  ];

  return { defs };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    const name = (form.get("name") as string)?.trim();
    const key = (form.get("key") as string)?.trim().toLowerCase().replace(/\s+/g, "_");
    const type = form.get("type") as string;
    const ownerType = form.get("ownerType") as string;
    const description = (form.get("description") as string)?.trim() || null;

    if (!name || !key || !type || !ownerType) {
      return { ok: false, error: "Tüm alanlar zorunludur." };
    }

    const res = await admin.graphql(
      `#graphql
      mutation CreateDef($input: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $input) {
          createdDefinition { id name }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            name,
            namespace: "pixeldock",
            key,
            type,
            ownerType,
            description,
          },
        },
      },
    );
    const data = (await res.json()) as {
      data?: { metafieldDefinitionCreate?: { userErrors?: Array<{ message: string }> | null } | null };
    };
    const errors = data.data?.metafieldDefinitionCreate?.userErrors ?? [];
    if (errors.length) return { ok: false, error: errors[0].message };
    return { ok: true, error: null };
  }

  if (intent === "delete") {
    const id = form.get("id") as string;
    const ownerType = form.get("ownerType") as string;
    const res = await admin.graphql(
      `#graphql
      mutation DeleteDef($id: ID!, $ownerType: MetafieldOwnerType!) {
        metafieldDefinitionDelete(id: $id, ownerType: $ownerType) {
          userErrors { field message }
        }
      }`,
      { variables: { id, ownerType } },
    );
    const data = (await res.json()) as {
      data?: { metafieldDefinitionDelete?: { userErrors?: Array<{ message: string }> | null } | null };
    };
    const errors = data.data?.metafieldDefinitionDelete?.userErrors ?? [];
    if (errors.length) return { ok: false, error: errors[0].message };
    return { ok: true, error: null };
  }

  return { ok: false, error: "Geçersiz işlem." };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MetafieldsPage() {
  const { defs } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState("single_line_text_field");
  const [ownerType, setOwnerType] = useState("PRODUCT");
  const [description, setDescription] = useState("");

  const isSaving = fetcher.state !== "idle";
  const saveError = fetcher.data?.ok === false ? fetcher.data.error : null;

  const handleCreate = () => {
    const fd = new FormData();
    fd.append("intent", "create");
    fd.append("name", name);
    fd.append("key", key);
    fd.append("type", type);
    fd.append("ownerType", ownerType);
    fd.append("description", description);
    fetcher.submit(fd, { method: "post" });
    setCreateOpen(false);
    setName(""); setKey(""); setType("single_line_text_field"); setOwnerType("PRODUCT"); setDescription("");
  };

  const handleDelete = (def: MetafieldDef) => {
    if (!confirm(`"${def.name}" tanımını sil? Bu işlem geri alınamaz.`)) return;
    const fd = new FormData();
    fd.append("intent", "delete");
    fd.append("id", def.id);
    fd.append("ownerType", def.ownerType);
    fetcher.submit(fd, { method: "post" });
  };

  const resourceName = { singular: "tanım", plural: "tanım" };

  return (
    <Page
      title="Meta Alanları"
      subtitle="Form alanlarıyla eşleştirebileceğiniz Shopify metafield tanımları"
      primaryAction={
        <Button variant="primary" icon={PlusIcon} onClick={() => setCreateOpen(true)}>
          Yeni Tanım
        </Button>
      }
    >
      <BlockStack gap="400">

        {saveError && <Banner tone="critical">{saveError}</Banner>}

        <Card padding="0">
          {defs.length === 0 ? (
            <EmptyState
              heading="Henüz metafield tanımı yok"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <Text as="p" variant="bodyMd">
                "Yeni Tanım" butonuyla bir metafield tanımı ekleyin. Ardından form alanlarını bu tanımlarla eşleştirebilirsiniz.
              </Text>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={resourceName}
              itemCount={defs.length}
              headings={[
                { title: "Ad" },
                { title: "Anahtar (namespace.key)" },
                { title: "Tip" },
                { title: "Kaynak" },
                { title: "" },
              ]}
              selectable={false}
            >
              {defs.map((def) => (
                <IndexTable.Row key={def.id} id={def.id} position={defs.indexOf(def)}>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {def.name}
                      </Text>
                      {def.description && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {def.description}
                        </Text>
                      )}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="p" variant="bodySm" tone="subdued">
                      <code>{def.namespace}.{def.key}</code>
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge>{def.type}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone="info">{OWNER_LABELS[def.ownerType] ?? def.ownerType}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button
                      icon={DeleteIcon}
                      variant="tertiary"
                      tone="critical"
                      size="slim"
                      onClick={() => handleDelete(def)}
                      loading={isSaving}
                      accessibilityLabel="Sil"
                    />
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm" fontWeight="semibold">Form alanı eşleştirme</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Yukarıda oluşturduğunuz tanımları, form editöründe her alanın "Metafield" bölümünden seçebilirsiniz.
              Form gönderildiğinde seçilen değer, ilgili ürünün metafield'ına otomatik kaydedilir.
            </Text>
          </BlockStack>
        </Card>

        <Box paddingBlockEnd="1200" />
      </BlockStack>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Metafield Tanımı"
        primaryAction={{ content: "Oluştur", onAction: handleCreate, loading: isSaving }}
        secondaryActions={[{ content: "İptal", onAction: () => setCreateOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <FormLayout.Group>
              <TextField
                label="Ad"
                value={name}
                onChange={setName}
                autoComplete="off"
                helpText="Örn: Logo Dosyası"
              />
              <TextField
                label="Anahtar (key)"
                value={key}
                onChange={setKey}
                autoComplete="off"
                helpText="Örn: logo_url — boşluk kullanmayın"
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <Select
                label="Veri tipi"
                options={TYPE_OPTIONS}
                value={type}
                onChange={setType}
              />
              <Select
                label="Kaynak"
                options={OWNER_OPTIONS}
                value={ownerType}
                onChange={setOwnerType}
              />
            </FormLayout.Group>
            <TextField
              label="Açıklama (opsiyonel)"
              value={description}
              onChange={setDescription}
              autoComplete="off"
              multiline={2}
            />
            <Box>
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">
                  Namespace: <strong>pixeldock</strong> — Tam anahtar: <strong>pixeldock.{key || "..."}</strong>
                </Text>
              </InlineStack>
            </Box>
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
