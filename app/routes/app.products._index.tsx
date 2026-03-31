import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Page,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import { EditIcon } from "@shopify/polaris-icons";
import type { FormsRegistry } from "../forms.types";

const NAMESPACE = "pixeldock";
const REGISTRY_KEY = "forms_registry";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // 1. Fetch forms registry
  const regRes = await admin.graphql(
    `#graphql
    query FormsRegistry($namespace: String!, $key: String!) {
      currentAppInstallation {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { variables: { namespace: NAMESPACE, key: REGISTRY_KEY } },
  );
  const regData = (await regRes.json()) as {
    data?: { currentAppInstallation?: { metafield?: { value: string } | null } | null };
  };
  const raw = regData.data?.currentAppInstallation?.metafield?.value;
  const registry: FormsRegistry = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};

  // 2. Collect all unique product IDs across all forms
  const productIdToForms: Record<string, Array<{ id: string; name: string; status: string }>> = {};
  for (const form of Object.values(registry)) {
    for (const pid of form.assignedProductIds ?? []) {
      if (!productIdToForms[pid]) productIdToForms[pid] = [];
      productIdToForms[pid].push({ id: form.id, name: form.name, status: form.status ?? "draft" });
    }
  }

  const allProductIds = Object.keys(productIdToForms);

  // 3. Resolve product details in one query
  type ProductInfo = { id: string; title: string; image: string | null; handle: string };
  let products: ProductInfo[] = [];

  if (allProductIds.length > 0) {
    const prodRes = await admin.graphql(
      `#graphql
      query ProductsByIds($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            featuredImage { url }
          }
        }
      }`,
      { variables: { ids: allProductIds } },
    );
    const prodData = (await prodRes.json()) as {
      data?: {
        nodes?: Array<{
          id?: string;
          title?: string;
          handle?: string;
          featuredImage?: { url: string } | null;
        } | null>;
      };
    };
    products = (prodData.data?.nodes ?? [])
      .filter((n): n is { id: string; title: string; handle: string; featuredImage?: { url: string } | null } => !!n?.id)
      .map((n) => ({ id: n.id, title: n.title ?? "", handle: n.handle ?? "", image: n.featuredImage?.url ?? null }));
  }

  // 4. Combine: each product + its assigned forms
  const rows = products.map((p) => ({
    ...p,
    forms: productIdToForms[p.id] ?? [],
  }));

  return { rows };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { rows } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page
      title="Products"
      subtitle="Products with assigned PixelDock forms"
    >
      <BlockStack gap="400">
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              heading="No products assigned yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{ content: "Go to Forms", url: "/app/forms" }}
            >
              <Text as="p" variant="bodyMd">
                Open a form and assign it to one or more products from the "Assigned Products" section.
              </Text>
            </EmptyState>
          </Card>
        ) : (
          <BlockStack gap="300">
            {rows.map((row) => (
              <Card key={row.id} padding="500">
                <InlineStack align="space-between" blockAlign="start" wrap={false}>
                  {/* Product info */}
                  <InlineStack gap="400" blockAlign="center" wrap={false}>
                    <Thumbnail
                      source={row.image ?? ""}
                      alt={row.title}
                      size="large"
                    />
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" fontWeight="semibold">
                        {row.title}
                      </Text>
                      {/* Assigned forms */}
                      <InlineStack gap="200" wrap>
                        {row.forms.map((f) => (
                          <Badge
                            key={f.id}
                            tone={f.status === "active" ? "success" : "attention"}
                          >
                            {f.name}
                          </Badge>
                        ))}
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {row.forms.length} form{row.forms.length !== 1 ? "s" : ""} assigned
                      </Text>
                    </BlockStack>
                  </InlineStack>

                  {/* Actions */}
                  <InlineStack gap="200" wrap={false}>
                    {row.forms.map((f) => (
                      <Button
                        key={f.id}
                        icon={EditIcon}
                        variant="secondary"
                        size="slim"
                        onClick={() => navigate(`/app/forms/${f.id}`)}
                      >
                        {f.name}
                      </Button>
                    ))}
                  </InlineStack>
                </InlineStack>
              </Card>
            ))}
          </BlockStack>
        )}

        <Box paddingBlockEnd="1200" />
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
