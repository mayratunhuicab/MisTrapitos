
import { SidebarProvider, Sidebar, SidebarContent, SidebarFooter, SidebarInset, SidebarTrigger, SidebarHeader } from '@/components/ui/sidebar';
import { DashboardNav } from '@/components/dashboard-nav';
import { UserNav } from '@/components/user-nav';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  
  return (
    <div className="relative flex h-screen min-h-screen w-full font-sans">
      <SidebarProvider defaultOpen>
        <Sidebar 
          collapsible="icon" 
          className="border-r-2 border-black hidden md:flex"
        >
          <SidebarHeader>
            <SidebarTrigger />
          </SidebarHeader>
          <SidebarContent className="py-2">
            <DashboardNav />
          </SidebarContent>
          <SidebarFooter>
            <UserNav />
          </SidebarFooter>
        </Sidebar>

        <div className="relative flex-1 flex flex-col overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mi-fondo.png"
            alt="Fondo personalizado para TrapitoStock"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50"></div>

          <main className="relative flex-1 overflow-y-auto px-4 pt-8 sm:px-6 lg:px-8 pb-20 md:pb-8">
            {children}
          </main>

          <MobileBottomNav />

        </div>
      </SidebarProvider>
    </div>
  );
}
