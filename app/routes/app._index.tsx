import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getThemeImageDashboardData,
  saveThemeImageMetadata,
} from "../models/theme-images.server";
import styles from "../styles/theme-image-dashboard.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  return getThemeImageDashboardData(admin);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const filename = readRequiredText(formData, "filename");
  const imageUrl = readRequiredText(formData, "imageUrl");
  const themeId = readRequiredText(formData, "themeId");
  const themeName = readRequiredText(formData, "themeName");

  const result = await saveThemeImageMetadata(admin, {
    altText: readText(formData, "altText"),
    filename,
    imageUrl,
    label: readText(formData, "label"),
    note: readText(formData, "note"),
    themeId,
    themeName,
  });

  return {
    deleted: result.deleted,
    filename,
    key: result.key,
    ok: true,
    updatedAt: result.updatedAt,
  };
};

export default function Index() {
  const { images, metafieldUpdatedAt, storageKey, theme } =
    useLoaderData<typeof loader>();
  const syncedCount = images.filter((image) => image.metadata).length;

  return (
    <s-page heading="Theme image vault">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>PixelDock</p>
            <h2 className={styles.heroTitle}>
              Theme tarafinda yuklenen gorselleri tek ekrandan izle ve metadata
              olarak Shopify icinde sakla.
            </h2>
            <p className={styles.heroText}>
              Canli temadaki image asset&apos;leri cekiyoruz, onizlemeyi burada
              gosteriyoruz ve her gorsel icin kaydi app metafield&apos;inda
              tutuyoruz.
            </p>
          </div>
          <dl className={styles.stats}>
            <div className={styles.statCard}>
              <dt>Aktif tema</dt>
              <dd>{theme ? theme.name : "Tema bulunamadi"}</dd>
            </div>
            <div className={styles.statCard}>
              <dt>Toplam gorsel</dt>
              <dd>{images.length}</dd>
            </div>
            <div className={styles.statCard}>
              <dt>Metadata senkronlu</dt>
              <dd>{syncedCount}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.summaryPanel}>
          <div>
            <p className={styles.summaryLabel}>Storage key</p>
            <p className={styles.summaryValue}>{storageKey}</p>
          </div>
          <div>
            <p className={styles.summaryLabel}>Tema rolu</p>
            <p className={styles.summaryValue}>{theme?.role ?? "-"}</p>
          </div>
          <div>
            <p className={styles.summaryLabel}>Son backend guncellemesi</p>
            <p className={styles.summaryValue}>
              {formatDateTime(metafieldUpdatedAt)}
            </p>
          </div>
        </section>

        {theme ? (
          images.length ? (
            <section className={styles.grid}>
              {images.map((image) => (
                <ThemeImageCard
                  image={image}
                  key={image.key}
                  themeId={theme.id}
                  themeName={theme.name}
                />
              ))}
            </section>
          ) : (
            <EmptyState
              body="Temada image content type ile okunabilen bir asset bulunamadi. Tema editorunden gorsel ekledikten sonra sayfayi yenileyebilirsin."
              title="Gosterilecek gorsel bulunamadi"
            />
          )
        ) : (
          <EmptyState
            body="Bu store icin okunabilir bir Online Store temasi donmedi. Uygulamanin `read_themes` scope'u ile tekrar authorize edildiginden emin ol."
            title="Tema verisi alinmadi"
          />
        )}
      </div>
    </s-page>
  );
}

type ThemeImageCardProps = {
  image: Awaited<ReturnType<typeof loader>>["images"][number];
  themeId: string;
  themeName: string;
};

function ThemeImageCard({ image, themeId, themeName }: ThemeImageCardProps) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const isSaving =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (!fetcher.data?.ok) {
      return;
    }

    shopify.toast.show(
      fetcher.data.deleted
        ? "Metadata kaydi temizlendi"
        : "Metadata Shopify backend'e yazildi",
    );
  }, [fetcher.data, shopify]);

  return (
    <article className={styles.card}>
      <div className={styles.imageFrame}>
        <img
          alt={image.metadata?.altText || image.filename}
          className={styles.image}
          loading="lazy"
          src={image.url}
        />
        <div className={styles.badges}>
          <span className={styles.badge}>{image.contentType}</span>
          {image.metadata ? (
            <span className={styles.badgeAccent}>Synced</span>
          ) : (
            <span className={styles.badgeMuted}>Unsynced</span>
          )}
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.filename}>{image.filename}</h3>
            <p className={styles.metaLine}>
              {formatBytes(image.size)} · {formatDateTime(image.updatedAt)}
            </p>
          </div>
          <a
            className={styles.assetLink}
            href={image.url}
            rel="noreferrer"
            target="_blank"
          >
            Open asset
          </a>
        </div>

        <fetcher.Form className={styles.form} method="post">
          <input name="filename" type="hidden" value={image.filename} />
          <input name="imageUrl" type="hidden" value={image.url} />
          <input name="themeId" type="hidden" value={themeId} />
          <input name="themeName" type="hidden" value={themeName} />

          <label className={styles.field}>
            <span>Label</span>
            <input
              defaultValue={image.metadata?.label ?? ""}
              name="label"
              placeholder="Hero banner, lookbook cover..."
              type="text"
            />
          </label>

          <label className={styles.field}>
            <span>Alt text</span>
            <input
              defaultValue={image.metadata?.altText ?? ""}
              name="altText"
              placeholder="SEO ve erisilebilirlik icin aciklama"
              type="text"
            />
          </label>

          <label className={styles.field}>
            <span>Note</span>
            <textarea
              defaultValue={image.metadata?.note ?? ""}
              name="note"
              placeholder="Kullanim amaci, section referansi veya ic not..."
              rows={4}
            />
          </label>

          <div className={styles.formFooter}>
            <p className={styles.syncInfo}>
              {image.metadata
                ? `Son sync: ${formatDateTime(image.metadata.syncedAt)}`
                : "Bu gorsel icin backend kaydi henuz yok."}
            </p>
            <button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save metadata"}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </article>
  );
}

type EmptyStateProps = {
  body: string;
  title: string;
};

function EmptyState({ body, title }: EmptyStateProps) {
  return (
    <section className={styles.emptyState}>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function readRequiredText(formData: FormData, key: string) {
  const value = readText(formData, key);

  if (!value) {
    throw new Response(`Missing field: ${key}`, { status: 400 });
  }

  return value;
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (!value) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
  const size = value / 1024 ** exponent;

  return `${size.toFixed(size >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
