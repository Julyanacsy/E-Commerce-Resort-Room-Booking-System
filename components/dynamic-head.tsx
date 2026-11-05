'use client'

import { useEffect } from 'react'
import { useBranding, type Branding } from '@/hooks/use-branding'
import { useMarketplaceSettings } from '@/hooks/use-marketplace-settings'

type Props = {
  /** When set (e.g. `?o=` resort landing), overrides global `settings/branding` for document title. */
  brandingOverride?: Branding | null
}

export default function DynamicHead({ brandingOverride = null }: Props) {
  const { branding: globalBranding } = useBranding()
  const { settings: mp } = useMarketplaceSettings()
  const branding = brandingOverride ?? globalBranding

  useEffect(() => {
    const siteSuffix = String(mp.siteTabTitle || '').trim()
    const fav =
      String(mp.siteFaviconUrl || '').trim() ||
      String(mp.navLogoUrl || '').trim() ||
      '/icon.svg'

    if (brandingOverride) {
      const name = String(branding.name || '').trim()
      document.title = siteSuffix ? (name ? `${name} — ${siteSuffix}` : siteSuffix) : name || 'Resort'
    } else {
      document.title =
        siteSuffix ||
        (branding.tabTitle ? String(branding.tabTitle) : '') ||
        'LuxeStay'
    }

    let faviconLink = document.querySelector("link[rel='icon']") as HTMLLinkElement
    if (!faviconLink) {
      faviconLink = document.createElement('link')
      faviconLink.rel = 'icon'
      document.head.appendChild(faviconLink)
    }
    faviconLink.href = fav

    let appleIconLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement
    if (!appleIconLink) {
      appleIconLink = document.createElement('link')
      appleIconLink.rel = 'apple-touch-icon'
      document.head.appendChild(appleIconLink)
    }
    appleIconLink.href = fav

    let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement
    if (manifestLink) {
      manifestLink.href = `/api/manifest?t=${Date.now()}`
    }

    let appleTitleMeta = document.querySelector("meta[name='apple-mobile-web-app-title']") as HTMLMetaElement
    if (!appleTitleMeta) {
      appleTitleMeta = document.createElement('meta')
      appleTitleMeta.name = 'apple-mobile-web-app-title'
      document.head.appendChild(appleTitleMeta)
    }
    appleTitleMeta.content = branding.name || 'LuxeStay'
  }, [
    brandingOverride,
    branding.name,
    branding.tabTitle,
    mp.siteTabTitle,
    mp.siteFaviconUrl,
    mp.navLogoUrl,
  ])

  return null
}
