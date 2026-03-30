import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
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
  InlineStack,
  Page,
  Text,
  Thumbnail,
  IndexTable,
  Link,
} from "@shopify/polaris";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LineItemProperty = { name: string; value: string };

type OrderLineItem = {
  id: string;
  title: string;
  quantity: number;
  properties: LineItemProperty[];
};

type PixelDockOrder = {
  id: string;
  name: string;
  createdAt: string;
  customer: { displayName: string; email: string } | null;
  lineItems: OrderLineItem[];
  statusPageUrl: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFileUrl(value: string) {
  return /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg|pdf|zip|docx?)(\?.*)?$/i.test(value);
}

function isImageUrl(value: string) {
  return /^https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(value);
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? null;
  const direction = url.searchParams.get("dir") ?? "next";

  const paginationArgs = direction === "prev" && cursor
    ? `last: 20, before: "${cursor}"`
    : cursor
    ? `first: 20, after: "${cursor}"`
    : "first: 20";

  const res = await admin.graphql(`#graphql
    query Orders {
      orders(${paginationArgs}, sortKey: CREATED_AT, reverse: true) {
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes {
          id
          name
          createdAt
          statusPageUrl
          customer { displayName email }
          lineItems(first: 10) {
            nodes {
              id
              title
              quantity
              customAttributes { key value }
            }
          }
        }
      }
    }
  `);

  const data = (await res.json()) as {
    data?: {
      orders?: {
        pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string; endCursor: string };
        nodes: Array<{
          id: string;
          name: string;
          createdAt: string;
          statusPageUrl: string;
          customer?: { displayName: string; email: string } | null;
          lineItems: {
            nodes: Array<{
              id: string;
              title: string;
              quantity: number;
              customAttributes: Array<{ key: string; value: string }>;
            }>;
          };
        }>;
      };
    };
  };

  const rawOrders = data.data?.orders?.nodes ?? [];

  // Only include orders that have at least one line item with file properties
  const orders: PixelDockOrder[] = rawOrders
    .map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      statusPageUrl: o.statusPageUrl,
      customer: o.customer ?? null,
      lineItems: o.lineItems.nodes
        .map((li) => ({
          id: li.id,
          title: li.title,
          quantity: li.quantity,
          properties: li.customAttributes.map((a) => ({ name: a.key, value: a.value })),
        }))
        .filter((li) => li.properties.some((p) => isFileUrl(p.value))),
    }))
    .filter((o) => o.lineItems.length > 0);

  return {
    orders,
    pageInfo: data.data?.orders?.pageInfo ?? null,
  };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { orders, pageInfo } = useLoaderData<typeof loader>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Page
      title="Siparişler"
      subtitle="PixelDock formu doldurulmuş siparişler"
    >
      <BlockStack gap="400">
        {orders.length === 0 ? (
          <Card>
            <EmptyState
              heading="Henüz sipariş yok"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <Text as="p" variant="bodyMd">
                Müşteriler form doldurup sipariş verdiğinde burада görünür.
              </Text>
            </EmptyState>
          </Card>
        ) : (
          <BlockStack gap="400">
            {orders.map((order) => (
              <Card key={order.id} padding="0">
                {/* Order header */}
                <Box paddingBlock="400" paddingInline="500" borderBlockEndWidth="025" borderColor="border">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {order.name}
                      </Text>
                      <Badge tone="info">{order.customer?.displayName ?? "Misafir"}</Badge>
                      {order.customer?.email && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {order.customer.email}
                        </Text>
                      )}
                    </InlineStack>
                    <InlineStack gap="300" blockAlign="center">
                      <Text as="p" variant="bodySm" tone="subdued">
                        {formatDate(order.createdAt)}
                      </Text>
                      <Button
                        variant="tertiary"
                        size="slim"
                        url={order.statusPageUrl}
                        target="_blank"
                      >
                        Shopify'da Gör
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Box>

                {/* Line items */}
                <Box paddingBlock="400" paddingInline="500">
                  <BlockStack gap="500">
                    {order.lineItems.map((item) => {
                      const fileProps = item.properties.filter((p) => isFileUrl(p.value));
                      const otherProps = item.properties.filter((p) => !isFileUrl(p.value));

                      return (
                        <BlockStack key={item.id} gap="300">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {item.title}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              × {item.quantity}
                            </Text>
                          </InlineStack>

                          {/* Other properties */}
                          {otherProps.length > 0 && (
                            <Box
                              background="bg-surface-secondary"
                              borderRadius="200"
                              padding="300"
                            >
                              <BlockStack gap="150">
                                {otherProps.map((p) => (
                                  <InlineStack key={p.name} gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      {p.name}:
                                    </Text>
                                    <Text as="p" variant="bodySm">
                                      {p.value}
                                    </Text>
                                  </InlineStack>
                                ))}
                              </BlockStack>
                            </Box>
                          )}

                          {/* File properties */}
                          {fileProps.length > 0 && (
                            <BlockStack gap="200">
                              {fileProps.map((p) => (
                                <Box
                                  key={p.name}
                                  background="bg-surface-secondary"
                                  borderRadius="200"
                                  padding="300"
                                  borderWidth="025"
                                  borderColor="border"
                                >
                                  <InlineStack gap="400" blockAlign="center" wrap={false}>
                                    {/* Thumbnail */}
                                    <div
                                      style={{ cursor: isImageUrl(p.value) ? "pointer" : "default", flexShrink: 0 }}
                                      onClick={() => isImageUrl(p.value) && setPreviewUrl(p.value)}
                                    >
                                      {isImageUrl(p.value) ? (
                                        <Thumbnail
                                          source={p.value}
                                          alt={p.name}
                                          size="large"
                                        />
                                      ) : (
                                        <Box
                                          background="bg-surface-tertiary"
                                          borderRadius="200"
                                          padding="400"
                                        >
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            📄 Dosya
                                          </Text>
                                        </Box>
                                      )}
                                    </div>

                                    {/* Info */}
                                    <BlockStack gap="100">
                                      <Text as="p" variant="bodySm" fontWeight="semibold">
                                        {p.name}
                                      </Text>
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        {p.value.split("/").pop()?.split("?")[0] ?? p.value}
                                      </Text>
                                    </BlockStack>

                                    {/* Actions */}
                                    <div style={{ marginLeft: "auto" }}>
                                      <InlineStack gap="200">
                                        {isImageUrl(p.value) && (
                                          <Button
                                            size="slim"
                                            variant="secondary"
                                            onClick={() => setPreviewUrl(p.value)}
                                          >
                                            Önizle
                                          </Button>
                                        )}
                                        <Button
                                          size="slim"
                                          variant="primary"
                                          url={p.value}
                                          target="_blank"
                                          download
                                        >
                                          İndir
                                        </Button>
                                      </InlineStack>
                                    </div>
                                  </InlineStack>
                                </Box>
                              ))}
                            </BlockStack>
                          )}
                        </BlockStack>
                      );
                    })}
                  </BlockStack>
                </Box>
              </Card>
            ))}

            {/* Pagination */}
            {(pageInfo?.hasPreviousPage || pageInfo?.hasNextPage) && (
              <InlineStack align="center" gap="300">
                {pageInfo?.hasPreviousPage && (
                  <Button
                    url={`/app/orders?cursor=${pageInfo.startCursor}&dir=prev`}
                  >
                    ← Önceki
                  </Button>
                )}
                {pageInfo?.hasNextPage && (
                  <Button
                    url={`/app/orders?cursor=${pageInfo.endCursor}&dir=next`}
                  >
                    Sonraki →
                  </Button>
                )}
              </InlineStack>
            )}
          </BlockStack>
        )}

        <Box paddingBlockEnd="1200" />
      </BlockStack>

      {/* Full-screen image preview overlay */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={previewUrl}
            alt="Önizleme"
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: 12,
              boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
              objectFit: "contain",
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewUrl(null)}
            style={{
              position: "absolute",
              top: 20,
              right: 24,
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "#fff",
              fontSize: 24,
              width: 40,
              height: 40,
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
