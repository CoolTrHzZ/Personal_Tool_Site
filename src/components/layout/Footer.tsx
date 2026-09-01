import site from '../../data/site.json'
import type { SiteConfig } from '../../types'

export default function Footer() { return <footer>{(site as SiteConfig).footer}</footer> }
