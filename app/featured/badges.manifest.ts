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
]
