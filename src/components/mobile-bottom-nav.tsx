
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, LayoutDashboard, ShoppingCart, Shirt, TrendingDown, Users, Contact, PackageCheck } from "lucide-react"
import { useUser } from "@/firebase"
import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { UserNav } from "./user-nav"

const allNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panel", roles: ["admin"] },
  { href: "/dashboard/inventory", icon: Shirt, label: "Inventario", roles: ["admin"] },
  { href: "/dashboard/sales", icon: ShoppingCart, label: "Ventas", roles: ["admin", "empleado"] },
  { href: "/dashboard/apartados", icon: PackageCheck, label: "Apartados", roles: ["admin", "empleado"] },
  { href: "/dashboard/expenses", icon: TrendingDown, label: "Gastos", roles: ["admin", "empleado"] },
  { href: "/dashboard/clients", icon: Contact, label: "Clientes", roles: ["admin", "empleado"] },
  { href: "/dashboard/reports", icon: BarChart3, label: "Reportes", roles: ["admin"] },
  { href: "/dashboard/users", icon: Users, label: "Usuarios", roles: ["admin"] },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const { user, isUserLoading } = useUser()

  const navItems = useMemo(() => {
    if (isUserLoading || !user?.role) {
      return [];
    }
    const filtered = allNavItems.filter(item => item.roles.includes(user.role!));
    // Remove the slice to allow all filtered items to be displayed
    return filtered;
  }, [user, isUserLoading]);

  if (isUserLoading || navItems.length === 0) {
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-sidebar border-t-2 border-black flex justify-around items-center">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-gray-300 rounded-full animate-pulse"></div>
            <div className="w-10 h-3 bg-gray-300 rounded-md animate-pulse mt-1"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-sidebar border-t-2 border-black flex justify-around items-center z-30">
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href) && (item.href !== "/dashboard" || pathname === "/dashboard");
        return (
          <Link href={item.href} key={item.href} className="flex flex-col items-center justify-center text-center w-full h-full">
            <div className={cn(
              "flex flex-col items-center gap-1 p-1 rounded-md transition-colors w-full h-full justify-center",
              isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
            )}>
              <item.icon className={cn("h-6 w-6", isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/80")} />
              <span className={cn(
                "text-xs font-medium",
                isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/80"
              )}>
                {item.label}
              </span>
            </div>
          </Link>
        );
      })}
       <div className="flex flex-col items-center justify-center text-center w-full h-full">
         <UserNav />
      </div>
    </nav>
  )
}
