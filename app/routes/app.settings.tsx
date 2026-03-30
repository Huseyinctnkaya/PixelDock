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
  FormLayout,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";

const SETTINGS_NAMESPACE = "pixeldock";
const SETTINGS_KEY = "block_settings";

type BlockSettings = {
  buttonLabel: string;
  allowedRegions: string;
  maxFileSizeMb: number;
};

const DEFAULT_SETTINGS: BlockSettings = {
  buttonLabel: "Patch Ekle",
  allowedRegions: "Göğüs, Kol, Sırt",
  maxFileSizeMb: 5,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(
    `#graphql
    query BlockSettings($namespace: String!, $key: String!) {
      currentAppInstallation {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { variables: { namespace: SETTINGS_NAMESPACE, key: SETTINGS_KEY } },
  );

  const data = (await res.json()) as {
    data?: {
      currentAppInstallation?: { metafield?: { value: string } | null } | null;
    };
  };

  const raw = data.data?.currentAppInstallation?.metafield?.value;
  let settings = DEFAULT_SETTINGS;

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      settings = {
        buttonLabel: parsed.buttonLabel ?? DEFAULT_SETTINGS.buttonLabel,
        allowedRegions: Array.isArray(parsed.allowedRegions)
          ? parsed.allowedRegions.join(", ")
          : parsed.allowedRegions ?? DEFAULT_SETTINGS.allowedRegions,
        maxFileSizeMb: parsed.maxFileSizeMb ?? DEFAULT_SETTINGS.maxFileSizeMb,
      };
    } catch {
      // use defaults
    }
  }

  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const settings = {
    buttonLabel: (form.get("buttonLabel") as string)?.trim() || DEFAULT_SETTINGS.buttonLabel,
    allowedRegions: (form.get("allowedRegions") as string)
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? DEFAULT_SETTINGS.allowedRegions.split(", "),
    maxFileSizeMb: Number(form.get("maxFileSizeMb")) || DEFAULT_SETTINGS.maxFileSizeMb,
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
    mutation SaveSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key updatedAt }
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

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isSaving = fetcher.state !== "idle";

  const [buttonLabel, setButtonLabel] = useState(settings.buttonLabel);
  const [allowedRegions, setAllowedRegions] = useState(settings.allowedRegions);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(String(settings.maxFileSizeMb));

  const saved = fetcher.data?.ok === true;
  const saveError = fetcher.data?.error;

  return (
    <Page
      title="Ayarlar"
      primaryAction={
        <Button
          variant="primary"
          loading={isSaving}
          onClick={() => {
            const form = new FormData();
            form.append("buttonLabel", buttonLabel);
            form.append("allowedRegions", allowedRegions);
            form.append("maxFileSizeMb", maxFileSizeMb);
            fetcher.submit(form, { method: "post" });
          }}
        >
          Kaydet
        </Button>
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">

            {saved && (
              <Banner tone="success" onDismiss={() => {}}>
                Ayarlar başarıyla kaydedildi.
              </Banner>
            )}
            {saveError && (
              <Banner tone="critical">
                {saveError}
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingSm" fontWeight="semibold">
                  Block Ayarları
                </Text>
                <FormLayout>
                  <TextField
                    label="Buton yazısı"
                    value={buttonLabel}
                    onChange={setButtonLabel}
                    helpText="Ürün sayfasındaki 'Patch Ekle' butonunun metni."
                    autoComplete="off"
                    name="buttonLabel"
                  />
                  <TextField
                    label="Bölgeler"
                    value={allowedRegions}
                    onChange={setAllowedRegions}
                    helpText="Müşterinin seçebileceği patch bölgeleri, virgülle ayır. Örn: Göğüs, Kol, Sırt"
                    autoComplete="off"
                    name="allowedRegions"
                  />
                  <TextField
                    label="Maksimum dosya boyutu (MB)"
                    value={maxFileSizeMb}
                    onChange={setMaxFileSizeMb}
                    type="number"
                    min="1"
                    max="20"
                    autoComplete="off"
                    name="maxFileSizeMb"
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
          </BlockStack>
        </Layout.Section>

      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
