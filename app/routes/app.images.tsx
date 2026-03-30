import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  EmptyState,
  InlineStack,
  Page,
  Spinner,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import styles from "../styles/images.module.css";

type ImageFile = {
  id: string;
  alt: string | null;
  createdAt: string;
  url: string;
  width: number | null;
  height: number | null;
  fileStatus: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after") ?? null;

  const response = await admin.graphql(
    `#graphql
    query PixelDockImages($after: String) {
      files(first: 50, after: $after, query: "media_type:IMAGE", sortKey: CREATED_AT, reverse: true) {
        nodes {
          ... on MediaImage {
            id
            alt
            createdAt
            fileStatus
            image { url width height }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`,
    { variables: { after } },
  );

  const data = (await response.json()) as {
    data?: {
      files?: {
        nodes?: Array<{
          id?: string;
          alt?: string | null;
          createdAt?: string;
          fileStatus?: string;
          image?: { url: string; width: number; height: number } | null;
        }>;
        pageInfo?: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };

  const nodes = data.data?.files?.nodes ?? [];
  const pageInfo = data.data?.files?.pageInfo;

  const images: ImageFile[] = nodes
    .filter((n) => n.image)
    .map((n) => ({
      id: n.id ?? "",
      alt: n.alt ?? null,
      createdAt: n.createdAt ?? "",
      url: n.image!.url,
      width: n.image!.width ?? null,
      height: n.image!.height ?? null,
      fileStatus: n.fileStatus ?? "READY",
    }));

  return { images, pageInfo };
};

export default function ImageLibrary() {
  const { images, pageInfo } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <Page
      title="Image Library"
      subtitle={`${images.length} görsel`}
    >
      <BlockStack gap="400">
        {isLoading ? (
          <Box padding="800">
            <InlineStack align="center">
              <Spinner size="large" />
            </InlineStack>
          </Box>
        ) : images.length === 0 ? (
          <EmptyState
            heading="Henüz görsel yok"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <Text as="p" variant="bodyMd">
              Müşteriler tema üzerindeki PixelDock block'u ile görsel yüklediğinde burada görünecek.
            </Text>
          </EmptyState>
        ) : (
          <>
            <div className={styles.grid}>
              {images.map((img) => (
                <ImageCard key={img.id} image={img} />
              ))}
            </div>

            {pageInfo?.hasNextPage && (
              <Box paddingBlockStart="400">
                <InlineStack align="center">
                  <Button
                    url={`?after=${pageInfo.endCursor ?? ""}`}
                    variant="secondary"
                  >
                    Daha fazla yükle
                  </Button>
                </InlineStack>
              </Box>
            )}
          </>
        )}
      </BlockStack>
    </Page>
  );
}

function ImageCard({ image }: { image: ImageFile }) {
  const date = image.createdAt
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(
        new Date(image.createdAt),
      )
    : null;

  const isPending = image.fileStatus !== "READY";

  return (
    <a
      className={styles.card}
      href={image.url}
      rel="noreferrer"
      target="_blank"
    >
      <div className={styles.imageWrap}>
        <img
          alt={image.alt ?? ""}
          className={styles.image}
          loading="lazy"
          src={image.url}
        />
        {isPending && (
          <div className={styles.statusOverlay}>
            <Badge tone="attention">{image.fileStatus}</Badge>
          </div>
        )}
      </div>
      <Box padding="200">
        <BlockStack gap="100">
          {date && (
            <Text as="p" variant="bodySm" tone="subdued">
              {date}
            </Text>
          )}
          {image.width && image.height && (
            <Text as="p" variant="bodySm" tone="subdued">
              {image.width} × {image.height}
            </Text>
          )}
        </BlockStack>
      </Box>
    </a>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
