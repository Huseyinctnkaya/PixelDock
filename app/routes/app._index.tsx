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
  Divider,
  Icon,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MinusCircleIcon,
} from "@shopify/polaris-icons";
import { useState } from "react";

const NAMESPACE = "pixeldock";
const SELECTED_THEME_KEY = "selected_theme_id";

type Theme = { id: string; name: string; role: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const [themeRes, filesRes, metaRes] = await Promise.all([
    admin.graphql(`#graphql
      query Themes {
        themes(first: 20) {
          nodes { id name role }
        }
      }`),
    admin.graphql(`#graphql
      query ImageCount {
        filesCount: files(first: 250, query: "media_type:IMAGE") {
          nodes { id }
        }
      }`),
    admin.graphql(
      `#graphql
      query SelectedTheme($namespace: String!, $key: String!) {
        currentAppInstallation {
          metafield(namespace: $namespace, key: $key) { value }
        }
      }`,
      { variables: { namespace: NAMESPACE, key: SELECTED_THEME_KEY } },
    ),
  ]);

  const themeData = (await themeRes.json()) as {
    data?: { themes?: { nodes?: Theme[] } };
  };
  const filesData = (await filesRes.json()) as {
    data?: { filesCount?: { nodes?: Array<{ id: string }> } };
  };
  const metaData = (await metaRes.json()) as {
    data?: { currentAppInstallation?: { metafield?: { value: string } | null } | null };
  };

  const themes = themeData.data?.themes?.nodes ?? [];
  const imageCount = filesData.data?.filesCount?.nodes?.length ?? 0;
  const selectedThemeId =
    metaData.data?.currentAppInstallation?.metafield?.value ?? null;

  // themeExplicitlyChosen: wizard tamamlandı mı kontrolü için — sadece kullanıcı aktif seçim yaptıysa true
  const themeExplicitlyChosen = Boolean(
    selectedThemeId && themes.find((t) => t.id === selectedThemeId),
  );

  // Görsel gösterim için fallback MAIN temayı kullan
  const selectedTheme =
    themes.find((t) => t.id === selectedThemeId) ??
    themes.find((t) => t.role === "MAIN") ??
    themes[0] ??
    null;

  return { themes, selectedTheme, themeExplicitlyChosen, imageCount };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const themeId = form.get("themeId") as string;

  const appRes = await admin.graphql(
    `#graphql query AppId { currentAppInstallation { id } }`,
  );
  const appData = (await appRes.json()) as {
    data?: { currentAppInstallation?: { id: string } | null };
  };
  const ownerId = appData.data?.currentAppInstallation?.id;
  if (!ownerId) return { ok: false };

  await admin.graphql(
    `#graphql
    mutation SaveTheme($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { message }
      }
    }`,
    {
      variables: {
        metafields: [{
          key: SELECTED_THEME_KEY,
          namespace: NAMESPACE,
          ownerId,
          type: "single_line_text_field",
          value: themeId,
        }],
      },
    },
  );

  return { ok: true };
};

export default function Dashboard() {
  const { themes, selectedTheme, themeExplicitlyChosen, imageCount } = useLoaderData<typeof loader>();

  const allDone = themeExplicitlyChosen;
  const [wizardOpen, setWizardOpen] = useState(!allDone);

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">

        {/* Stats */}
        <Card>
          <InlineGrid columns={{ xs: 1, md: "1fr auto" }} gap="400" alignItems="center">
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">
                PIXELDOCK
              </Text>
              <Text as="h2" variant="headingLg">
                Müşteri yüklemelerini yönet
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Tema üzerinden gelen logo ve görsel yüklemelerini tek ekrandan takip et.
              </Text>
            </BlockStack>
            <InlineStack gap="300" wrap={false}>
              <StatBox label="Aktif tema" value={selectedTheme?.name ?? "—"} />
              <StatBox label="Toplam görsel" value={String(imageCount)} />
            </InlineStack>
          </InlineGrid>
        </Card>

        {/* Setup wizard */}
        {!allDone && (
          <Card padding="0">
            {/* Header — her zaman görünür, tıklanabilir */}
            <Box
              paddingBlock="400"
              paddingInline="500"
              borderBlockEndWidth={wizardOpen ? "025" : "0"}
              borderColor="border"
            >
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="300" blockAlign="center">
                  <Text as="h2" variant="headingSm" fontWeight="semibold">
                    Kurulum
                  </Text>
                  <Badge tone="attention">Tamamlanmadı</Badge>
                </InlineStack>
                <Button
                  variant="tertiary"
                  icon={wizardOpen ? ChevronUpIcon : ChevronDownIcon}
                  onClick={() => setWizardOpen((o) => !o)}
                  accessibilityLabel={wizardOpen ? "Kurulumu kapat" : "Kurulumu aç"}
                />
              </InlineStack>
            </Box>

            {/* Steps — collapse animasyonu */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: wizardOpen ? "1fr" : "0fr",
                transition: "grid-template-rows 0.25s ease",
              }}
            >
              <div style={{ overflow: "hidden" }}>
                <Box paddingBlock="400" paddingInline="500">
                  <BlockStack gap="0">
                    <SetupStep
                      number={1}
                      title="Uygulamayı yükle"
                      description="PixelDock test mağazana yüklendi."
                      completed
                    />
                    <ThemeSelectStep
                      themes={themes}
                      selectedTheme={selectedTheme}
                      completed={themeExplicitlyChosen}
                    />
                    <SetupStep
                      number={3}
                      title="Block'u temana ekle"
                      description="Tema Editörü'nü aç → Ürün Sayfası → Block Ekle → Apps → PixelDock Upload"
                      completed={themeExplicitlyChosen}
                      action={
                        themeExplicitlyChosen ? (
                          <Button
                            variant="secondary"
                            size="slim"
                            url="shopify://admin/themes/current/editor"
                            target="_blank"
                          >
                            Tema Editörünü Aç
                          </Button>
                        ) : null
                      }
                    />
                    <SetupStep
                      number={4}
                      title="Test et"
                      description="Ürün sayfasına git ve 'Patch Ekle' butonuna tıklayarak yükleme akışını test et."
                      completed={false}
                      last
                      action={
                        themeExplicitlyChosen ? (
                          <Button variant="secondary" size="slim">
                            Önizlemeyi Aç
                          </Button>
                        ) : null
                      }
                    />
                  </BlockStack>
                </Box>
              </div>
            </div>
          </Card>
        )}

        {/* Quick actions */}
        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm" fontWeight="semibold">
                Image Library
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Müşterilerin yüklediği tüm görselleri kare grid'de görüntüle.
              </Text>
              <Box>
                <Button url="/app/images" variant="primary">
                  Görselleri Gör
                </Button>
              </Box>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm" fontWeight="semibold">
                Ayarlar
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Block buton yazısı, bölgeler ve dosya boyutu limitini ayarla.
              </Text>
              <Box>
                <Button url="/app/settings" variant="secondary">
                  Ayarlara Git
                </Button>
              </Box>
            </BlockStack>
          </Card>
        </InlineGrid>

      </BlockStack>
    </Page>
  );
}

// --- Setup step ---
function SetupStep({
  number,
  title,
  description,
  completed,
  action,
  last = false,
}: {
  number: number;
  title: string;
  description: string;
  completed: boolean;
  action?: React.ReactNode | null;
  last?: boolean;
}) {
  return (
    <Box paddingBlockEnd={last ? "0" : "400"}>
      <InlineStack gap="400" blockAlign="start" wrap={false}>
        <Box minWidth="24px" paddingBlockStart="050">
          {completed ? (
            <Icon source={CheckCircleIcon} tone="success" />
          ) : (
            <Icon source={MinusCircleIcon} tone="subdued" />
          )}
        </Box>
        <BlockStack gap="100" >
          <InlineStack align="space-between" blockAlign="center" wrap={false}>
            <Text
              as="p"
              variant="bodyMd"
              fontWeight="semibold"
              tone={completed ? "subdued" : undefined}
            >
              {number}. {title}
            </Text>
            {action}
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            {description}
          </Text>
        </BlockStack>
      </InlineStack>
      {!last && (
        <Box paddingInlineStart="1000" paddingBlockStart="400">
          <Divider />
        </Box>
      )}
    </Box>
  );
}

// --- Theme select step ---
function ThemeSelectStep({
  themes,
  selectedTheme,
  completed,
}: {
  themes: Theme[];
  selectedTheme: Theme | null;
  completed: boolean;
}) {
  const fetcher = useFetcher();
  const isSaving = fetcher.state !== "idle";

  const [value, setValue] = useState(selectedTheme?.id ?? themes[0]?.id ?? "");

  const options = themes.map((t) => ({
    label: `${t.name}${t.role === "MAIN" ? " (Aktif)" : ""}`,
    value: t.id,
  }));

  return (
    <Box paddingBlockEnd="400">
      <InlineStack gap="400" blockAlign="start" wrap={false}>
        <Box minWidth="24px" paddingBlockStart="050">
          {completed ? (
            <Icon source={CheckCircleIcon} tone="success" />
          ) : (
            <Icon source={MinusCircleIcon} tone="subdued" />
          )}
        </Box>
        <BlockStack gap="200" >
          <Text as="p" variant="bodyMd" fontWeight="semibold">
            2. Tema seç
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Hangi temaya PixelDock block'unu ekleyeceğini seç.
          </Text>
          <InlineStack gap="200" blockAlign="end" wrap={false}>
            <Box minWidth="260px">
              <Select
                label=""
                labelHidden
                options={options}
                value={value}
                onChange={setValue}
              />
            </Box>
            <fetcher.Form method="post">
              <input type="hidden" name="themeId" value={value} />
              <Button
                submit
                variant="primary"
                size="slim"
                loading={isSaving}
              >
                {completed ? "Güncelle" : "Seç"}
              </Button>
            </fetcher.Form>
          </InlineStack>
        </BlockStack>
      </InlineStack>
      <Box paddingInlineStart="1000" paddingBlockStart="400">
        <Divider />
      </Box>
    </Box>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <Box background="bg-surface-secondary" borderRadius="200" padding="400" minWidth="130px">
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingMd" fontWeight="bold">
          {value}
        </Text>
      </BlockStack>
    </Box>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
