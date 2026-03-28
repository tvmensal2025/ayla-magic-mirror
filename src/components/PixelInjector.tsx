import { useEffect } from "react";

interface PixelInjectorProps {
  facebookPixelId?: string | null;
  googleAnalyticsId?: string | null;
}

const PixelInjector = ({ facebookPixelId, googleAnalyticsId }: PixelInjectorProps) => {
  useEffect(() => {
    const scripts: HTMLScriptElement[] = [];

    if (facebookPixelId) {
      const fbScript = document.createElement("script");
      fbScript.innerHTML = `
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
        (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','${facebookPixelId}');
        fbq('track','PageView');
      `;
      document.head.appendChild(fbScript);
      scripts.push(fbScript);

      const noscript = document.createElement("noscript");
      noscript.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${facebookPixelId}&ev=PageView&noscript=1"/>`;
      document.head.appendChild(noscript as any);
    }

    if (googleAnalyticsId) {
      const gaLoader = document.createElement("script");
      gaLoader.async = true;
      gaLoader.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`;
      document.head.appendChild(gaLoader);
      scripts.push(gaLoader);

      const gaInit = document.createElement("script");
      gaInit.innerHTML = `
        window.dataLayer=window.dataLayer||[];
        function gtag(){dataLayer.push(arguments);}
        gtag('js',new Date());
        gtag('config','${googleAnalyticsId}');
      `;
      document.head.appendChild(gaInit);
      scripts.push(gaInit);
    }

    return () => {
      scripts.forEach((s) => s.parentNode?.removeChild(s));
    };
  }, [facebookPixelId, googleAnalyticsId]);

  return null;
};

export default PixelInjector;
