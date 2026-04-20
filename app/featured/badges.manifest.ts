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
]
