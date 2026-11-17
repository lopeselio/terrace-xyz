import Script from "next/script";

/*
 * Google Analytics 4. The measurement ID is public (it ships in every page), so it lives here rather than in
 * an env var. Empty means analytics is off. Ads storage and personalisation are always denied: we only count
 * visits. GA4's enhanced measurement records client-side route changes as page views.
 */
export const GA_ID = "G-LBWP6K6CVJ";

export function GoogleAnalytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});
gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
    </>
  );
}
