export type Category = { id: string; name: string; icon: string; order: number }
export type NavigationItem = {
  id: string; name: string; url: string; description: string; category: string
  icon: string; tags: string[]; enabled: boolean; order: number
}
export type SiteConfig = { name: string; title: string; description: string; github: string; footer: string; logo: string }
