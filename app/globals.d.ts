declare module "*.css";

// Shopify web components used in embedded app nav
declare namespace JSX {
  interface IntrinsicElements {
    "s-app-nav": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "s-link": React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLElement> & { href?: string }, HTMLElement>;
    "s-page": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { heading?: string }, HTMLElement>;
  }
}
