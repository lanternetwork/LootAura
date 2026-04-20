export type Badge = {
  name: string
  href: string
  img: string
  addedAt: string
  requirement: "badge"
  notes?: string
}

export const BADGES: Badge[] = [
  {
    name: "Example Directory",
    href: "https://example.com/lootaura",
    img: "/badges/example.svg",
    addedAt: "2026-04-20",
    requirement: "badge",
    notes: "initial test entry",
  },
  {
    name: "Million Dot Homepage",
    href: "https://milliondothomepage.com/product/loot-aura",
    img: "https://milliondothomepage.com/assets/images/badge.png",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Fazier badge",
    href: "https://fazier.com/launches/lootaura.com",
    img: "https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&theme=neutral",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Featured on Twelve Tools",
    href: "https://twelve.tools",
    img: "https://twelve.tools/badge0-white.svg",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Featured on SaaSBison",
    href: "https://saasbison.com",
    img: "https://saasbison.com/badge.png",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Launched on LaunchPanda",
    href: "https://launchpanda.dev/launches",
    img: "https://launchpanda.dev/images/badges/launchpanda-badge.svg",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Unite List",
    href: "https://unitelist.com",
    img: "https://unitelist.com/assets/images/badge.png",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Featured on Toolfio",
    href: "https://toolfio.com",
    img: "https://toolfio.com/toolfio-light-badge.png",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Featured on ufind.best",
    href: "https://ufind.best/products/loot-aura?utm_source=ufind.best",
    img: "https://ufind.best/badges/ufind-best-badge-light.svg",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Acid Tools",
    href: "https://acidtools.com",
    img: "https://acidtools.com/assets/images/badge.png",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Featured on neeed.directory",
    href: "https://neeed.directory/products/lootaura?utm_source=lootaura",
    img: "https://neeed.directory/badges/neeed-badge-light.svg",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Featured on Wired Business",
    href: "https://wired.business",
    img: "https://wired.business/badge0-white.svg",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "My Launch Stash",
    href: "https://mylaunchstash.com",
    img: "https://mylaunchstash.com/assets/images/badge.png",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
  {
    name: "Startup Vessel",
    href: "https://startupvessel.com",
    img: "https://startupvessel.com/assets/images/badge.png",
    addedAt: "2026-04-20",
    requirement: "badge",
  },
]
