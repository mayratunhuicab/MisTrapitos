
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, LayoutDashboard, Palette, ShoppingCart, Shirt, TrendingDown, Users, Contact, PackageCheck } from "lucide-react"

import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar"
import { useUser } from "@/firebase"
import { useMemo } from "react"

const allNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panel", roles: ["admin"] },
  { href: "/dashboard/inventory", icon: Shirt, label: "Inventario", roles: ["admin"] },
  { href: "/dashboard/sales", icon: ShoppingCart, label: "Ventas", roles: ["admin", "empleado"] },
  { href: "/dashboard/apartados", icon: PackageCheck, label: "Apartados", roles: ["admin", "empleado"] },
  { href: "/dashboard/expenses", icon: TrendingDown, label: "Gastos", roles: ["admin", "empleado"] },
  { href: "/dashboard/clients", icon: Contact, label: "Clientes", roles: ["admin", "empleado"] },
  { href: "/dashboard/reports", icon: BarChart3, label: "Reportes", roles: ["admin"] },
  { href: "/dashboard/users", icon: Users, label: "Usuarios", roles: ["admin"] },
  { href: "/dashboard/customize", icon: Palette, label: "Personalizar", roles: ["admin"] },
]

export function DashboardNav() {
  const pathname = usePathname()
  const { user, isUserLoading } = useUser()

  const navItems = useMemo(() => {
    if (isUserLoading || !user?.role) {
      return [];
    }
    
    // Filter nav items based on the user's role
    return allNavItems.filter(item => item.roles.includes(user.role!));

  }, [user, isUserLoading]);

  if (isUserLoading) {
    return (
        <SidebarMenu>
          <SidebarMenuSkeleton showIcon width="62%" />
          <SidebarMenuSkeleton showIcon width="84%" />
          <SidebarMenuSkeleton showIcon width="73%" />
          <SidebarMenuSkeleton showIcon width="80%" />
        </SidebarMenu>
    )
  }
  
  if (navItems.length === 0) {
    return null; // Or a message indicating no access
  }

  return (
    <SidebarMenu>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            isActive={pathname.startsWith(item.href) && (item.href !== "/dashboard" || pathname === "/dashboard")}
            tooltip={item.label}
          >
            <Link href={item.href}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
