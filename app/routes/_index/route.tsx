import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>PixelDock</p>
        <h1 className={styles.heading}>Theme gorsellerini Shopify backend&apos;de kilitle.</h1>
        <p className={styles.text}>
          Tema editorunden yuklenen image asset&apos;leri embedded app icinde
          listele, onizle ve her gorsel icin metadata kaydini tek yerden yonet.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Open app
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Theme image feed</strong>. Canli temadaki gorselleri dosya
            adlari, boyutlari ve onizlemeleriyle getirir.
          </li>
          <li>
            <strong>Metadata capture</strong>. Label, alt text ve ic not gibi
            alanlari her gorsel icin ayri ayri saklar.
          </li>
          <li>
            <strong>Shopify-native storage</strong>. Kayitlar app metafield&apos;i
            uzerinden Shopify tarafinda tutulur.
          </li>
        </ul>
      </div>
    </div>
  );
}
