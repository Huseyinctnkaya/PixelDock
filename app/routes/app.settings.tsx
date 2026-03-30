import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  CalloutCard,
  Card,
  ChoiceList,
  FormLayout,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";

export const SETTINGS_NAMESPACE = "pixeldock";
export const SETTINGS_KEY = "app_settings";

export type AppSettings = {
  maxFileSizeMb: number;
  acceptedTypes: string[]; // ["image/png", "image/jpeg", "image/webp"]
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  maxFileSizeMb: 5,
  acceptedTypes: ["image/png", "image/jpeg"],
};

const TYPE_OPTIONS = [
  { label: "PNG", value: "image/png" },
  { label: "JPG / JPEG", value: "image/jpeg" },
  { label: "WEBP", value: "image/webp" },
  { label: "SVG", value: "image/svg+xml" },
];

// ─── Shared helper (also imported by upload route) ───────────────────────────

export async function fetchAppSettings(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
): Promise<AppSettings> {
  const res = await admin.graphql(
    `#graphql
    query AppSettings($namespace: String!, $key: String!) {
      currentAppInstallation {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { variables: { namespace: SETTINGS_NAMESPACE, key: SETTINGS_KEY } },
  );
  const data = (await res.json()) as {
    data?: { currentAppInstallation?: { metafield?: { value: string } | null } | null };
  };
  const raw = data.data?.currentAppInstallation?.metafield?.value;
  if (!raw) return DEFAULT_APP_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      maxFileSizeMb: parsed.maxFileSizeMb ?? DEFAULT_APP_SETTINGS.maxFileSizeMb,
      acceptedTypes: Array.isArray(parsed.acceptedTypes) && parsed.acceptedTypes.length
        ? parsed.acceptedTypes
        : DEFAULT_APP_SETTINGS.acceptedTypes,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const settings = await fetchAppSettings(admin);
  return { settings };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const maxFileSizeMb = Math.min(20, Math.max(1, Number(form.get("maxFileSizeMb")) || 5));
  const acceptedTypes = form.getAll("acceptedTypes") as string[];

  const settings: AppSettings = {
    maxFileSizeMb,
    acceptedTypes: acceptedTypes.length ? acceptedTypes : DEFAULT_APP_SETTINGS.acceptedTypes,
  };

  const appRes = await admin.graphql(`#graphql
    query AppId { currentAppInstallation { id } }`);
  const appData = (await appRes.json()) as {
    data?: { currentAppInstallation?: { id: string } | null };
  };
  const ownerId = appData.data?.currentAppInstallation?.id;
  if (!ownerId) return { ok: false, error: "App installation bulunamadı." };

  const saveRes = await admin.graphql(
    `#graphql
    mutation SaveAppSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          key: SETTINGS_KEY,
          namespace: SETTINGS_NAMESPACE,
          ownerId,
          type: "json",
          value: JSON.stringify(settings),
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isSaving = fetcher.state !== "idle";

  const [maxFileSizeMb, setMaxFileSizeMb] = useState(String(settings.maxFileSizeMb));
  const [acceptedTypes, setAcceptedTypes] = useState<string[]>(settings.acceptedTypes);

  const saved = fetcher.data?.ok === true;
  const saveError = fetcher.data?.error;

  const handleSave = () => {
    const form = new FormData();
    form.append("maxFileSizeMb", maxFileSizeMb);
    acceptedTypes.forEach((t) => form.append("acceptedTypes", t));
    fetcher.submit(form, { method: "post" });
  };

  return (
    <Page
      title="Ayarlar"
      primaryAction={
        <Button variant="primary" loading={isSaving} onClick={handleSave}>
          Kaydet
        </Button>
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">

            {saved && (
              <Banner tone="success" onDismiss={() => {}}>
                Ayarlar kaydedildi.
              </Banner>
            )}
            {saveError && (
              <Banner tone="critical">{saveError}</Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">
                    Yükleme Sınırları
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Tüm formlar için geçerli olan global yükleme kuralları.
                  </Text>
                </BlockStack>
                <FormLayout>
                  <TextField
                    label="Maksimum dosya boyutu (MB)"
                    value={maxFileSizeMb}
                    onChange={setMaxFileSizeMb}
                    type="number"
                    min="1"
                    max="20"
                    autoComplete="off"
                    name="maxFileSizeMb"
                    helpText="1 ile 20 MB arasında bir değer girin."
                  />
                  <ChoiceList
                    allowMultiple
                    title="Kabul edilen dosya tipleri"
                    choices={TYPE_OPTIONS}
                    selected={acceptedTypes}
                    onChange={setAcceptedTypes}
                  />
                </FormLayout>
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <CalloutCard
              title="Tema entegrasyonu"
              illustration="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              primaryAction={{
                content: "Tema Editörünü aç",
                url: "shopify://admin/themes/current/editor",
              }}
            >
              <Text as="p" variant="bodyMd">
                Block'u eklemek için Tema Editörü → Ürün Sayfası → Block Ekle → Apps → <strong>PixelDock Upload</strong>
              </Text>
            </CalloutCard>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  Hakkında
                </Text>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Uygulama
                  </Text>
                  <Text as="p" variant="bodyMd">
                    PixelDock
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Sürüm
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1.0.0
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

      </Layout>
      <Box paddingBlockEnd="1200" />
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
